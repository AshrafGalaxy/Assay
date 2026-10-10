"""
Local Tier-2 Semantic Embedding Categorizer using sentence-transformers/all-MiniLM-L6-v2.
Provides sub-2ms zero-shot classification for unrecognized Indian merchants and narrations.
"""

import logging
import threading
from typing import Dict, Tuple, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Indian-context enriched category prototype exemplar descriptions
CATEGORY_ANCHORS: Dict[str, list[str]] = {
    "Food & Dining": [
        "restaurant dining cafe coffee bakery eatery kitchen",
        "dhaba tiffin food mess biryani lunch dinner meals",
        "fast food snacks sweets pizza burger chai tea stall",
    ],
    "Groceries": [
        "supermarket grocery kirana store dmart general store",
        "vegetable fruit vendor daily needs milk dairy provisions",
        "flour rice pulses spices edible oil atta ration supplies",
    ],
    "Shopping": [
        "clothing apparel fashion retail garments boutique wear",
        "electronics gadgets mobile accessories footwear shoes",
        "departmental store cosmetics mall shopping e-commerce",
    ],
    "Healthcare": [
        "pharmacy medical store chemist medicines drugs prescription",
        "hospital clinic doctor diagnostic pathology lab dental care",
        "health wellness prescription capsules tablets healthcare medicine",
    ],
    "Transportation": [
        "cab taxi auto rickshaw metro bus train commute ride",
        "petrol diesel fuel pump gas station fastag toll parking",
        "railway ticket flight airfare transport booking",
    ],
    "Utilities": [
        "electricity power water bill payment utility board",
        "broadband wifi internet telecom mobile recharge",
        "piped gas cylinder lpg connection utility bills",
    ],
    "Entertainment": [
        "movies cinema theatre multiplex film show tickets",
        "streaming video ott music gaming concert event ticket recreation",
    ],
    "Services": [
        "salon spa parlour grooming haircut beauty care",
        "cleaning repair servicing maintenance plumbing carpentry laundry",
    ],
}


class SemanticCategorizer:
    """Local embedding-based zero-shot categorizer for transactions."""

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        self.categories = list(CATEGORY_ANCHORS.keys())
        self.anchor_embeddings: Optional[np.ndarray] = None
        self.anchor_cat_map: list[str] = []
        self._cache: Dict[str, Tuple[str, float]] = {}
        self._initialized = False
        self._load_lock = threading.Lock()

    def _load(self, local_files_only: bool) -> None:
        """Loads tokenizer + model and precomputes anchor embeddings."""
        from transformers import AutoTokenizer, AutoModel

        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_name, local_files_only=local_files_only
        )
        self.model = AutoModel.from_pretrained(
            self.model_name, local_files_only=local_files_only
        )
        self.model.eval()

        # Pre-compute prototype embeddings across all exemplars
        all_exemplars: list[str] = []
        self.anchor_cat_map = []
        for cat, phrases in CATEGORY_ANCHORS.items():
            for phrase in phrases:
                all_exemplars.append(phrase)
                self.anchor_cat_map.append(cat)

        self.anchor_embeddings = self._encode_batch(all_exemplars)
        self._initialized = True
        logger.info(
            "[SemanticCategorizer] Initialized %s with %d anchors across %d categories (local_files_only=%s)",
            self.model_name,
            len(all_exemplars),
            len(self.categories),
            local_files_only,
        )

    def _ensure_initialized(self, allow_download: bool = False) -> bool:
        """
        Lazy load model and precompute prototype anchor embeddings once.

        The request path (`classify`) only ever loads from the local HF cache:
        `from_pretrained` otherwise contacts huggingface.co on every cold start,
        which can hang for minutes on a flaky network and stall the first
        receipt scan. Downloading is reserved for `warm_up()` at app startup.
        """
        if self._initialized:
            return True

        with self._load_lock:
            if self._initialized:
                return True
            try:
                self._load(local_files_only=True)
                return True
            except Exception as local_error:
                if not allow_download:
                    logger.warning(
                        "[SemanticCategorizer] Model not in local cache; skipping Tier-2 for this request: %s",
                        str(local_error),
                    )
                    return False
            try:
                logger.info("[SemanticCategorizer] Downloading %s from Hugging Face Hub...", self.model_name)
                self._load(local_files_only=False)
                return True
            except Exception as e:
                logger.warning("[SemanticCategorizer] Failed to load embedding model: %s", str(e))
                return False

    def warm_up(self) -> bool:
        """Loads (and downloads if needed) the model. Intended for a background startup thread."""
        return self._ensure_initialized(allow_download=True)

    def _mean_pooling(self, model_output, attention_mask):
        import torch

        token_embeddings = model_output[0]
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        return sum_embeddings / sum_mask

    def _encode_batch(self, texts: list[str]) -> np.ndarray:
        """Encodes a batch of texts into normalized 384-dimensional embeddings."""
        import torch

        encoded_input = self.tokenizer(
            texts, padding=True, truncation=True, max_length=128, return_tensors="pt"
        )
        with torch.no_grad():
            model_output = self.model(**encoded_input)
            sentence_embeddings = self._mean_pooling(model_output, encoded_input["attention_mask"])
            normalized_embeddings = torch.nn.functional.normalize(sentence_embeddings, p=2, dim=1)
        return normalized_embeddings.cpu().numpy()

    def classify(self, text: str, threshold: float = 0.35, margin: float = 0.05) -> Tuple[str, float]:
        """
        Classifies an input text string into one of the 8 standard categories.
        Uses max cosine similarity across category exemplars, an absolute confidence floor,
        and a margin check over runner-up category.
        Returns (category_name, confidence_score).
        """
        clean_text = text.strip()
        if not clean_text:
            return "Other", 0.0

        cache_key = clean_text.lower()
        if cache_key in self._cache:
            return self._cache[cache_key]

        if not self._ensure_initialized():
            return "Other", 0.0

        try:
            # 1. Encode query
            query_embedding = self._encode_batch([clean_text])[0]  # shape: (384,)

            # 2. Compute cosine similarity against all anchors via dot product
            sims = np.dot(self.anchor_embeddings, query_embedding)  # shape: (num_anchors,)

            # 3. Aggregate max similarity per category
            cat_scores: Dict[str, float] = {}
            for cat in self.categories:
                indices = [i for i, c in enumerate(self.anchor_cat_map) if c == cat]
                cat_scores[cat] = float(np.max(sims[indices]))

            # 4. Sort categories by score descending
            sorted_cats = sorted(cat_scores.items(), key=lambda x: x[1], reverse=True)
            best_cat, best_score = sorted_cats[0]
            runner_cat, runner_score = sorted_cats[1]

            result: Tuple[str, float]
            # Must exceed minimum confidence and have a clear margin over the runner-up
            if best_score >= threshold and (best_score - runner_score >= margin):
                result = (best_cat, round(best_score, 3))
            else:
                result = ("Other", round(best_score, 3))

            self._cache[cache_key] = result
            return result
        except Exception as e:
            logger.warning("[SemanticCategorizer] Classification error for '%s': %s", clean_text, str(e))
            return "Other", 0.0



# Global singleton instance
semantic_categorizer = SemanticCategorizer()

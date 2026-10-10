"""
Probabilistic Cash Flow Forecasting Package (FIN 02 Addition 2).
Modules:
- synthesizer: 24-Month Synthetic Ledger Generator with Train/Val/Test splits.
- conformal_engine: Conformal Quantile Autoregression (CQ-AR) Engine.
- evaluator: Benchmark Evaluation Suite vs. Moving Average and Recurring baselines.
"""

from app.services.forecasting.synthesizer import FinancialSynthesizer
from app.services.forecasting.conformal_engine import ConformalQuantileEngine
from app.services.forecasting.evaluator import ForecastEvaluator

__all__ = ["FinancialSynthesizer", "ConformalQuantileEngine", "ForecastEvaluator"]

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Typography } from '../../components/Typography';
import { COLORS, FONTS } from '../../constants/theme';
import {
  queryCopilot,
  CopilotQueryResponse,
  formatINR,
} from '../../services/finance';
import {
  ChevronLeft,
  Sparkles,
  Paperclip,
  ArrowRight,
  BookOpen,
  Trash2,
  Settings,
  X,
  ShieldCheck,
  ChevronRight,
  Check,
  Clock,
  Plus,
} from 'lucide-react-native';

interface ChatMessage {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  timestamp: string;
  data?: CopilotQueryResponse;
}

interface StoredConversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const STORAGE_KEY_CONVERSATIONS = '@assay_copilot_conversations_v1';
const STORAGE_KEY_ACTIVE_ID = '@assay_copilot_active_id_v1';

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome-1',
  sender: 'assistant',
  text: `I can help you understand your finances, explain your cash flow forecast, check affordability, compare scenarios, and answer questions from your transactions.\n\nWhat would you like to know?`,
  timestamp: '',
};

const SUGGESTED_QUESTIONS = [
  'Why may my balance fall next month?',
  'Can I afford a ₹50,000 purchase?',
  'How can I increase my savings?',
  'Summarise my cash flow forecast',
];

export default function AssayCopilotScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  // Conversation state
  const [activeConversationId, setActiveConversationId] = useState<string>('default');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [savedConversations, setSavedConversations] = useState<StoredConversation[]>([]);

  // Composer state
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  // Menus and Modals
  const [menuVisible, setMenuVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // Load saved conversations on mount
  useEffect(() => {
    async function loadStoredHistory() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_CONVERSATIONS);
        if (raw) {
          const parsed: StoredConversation[] = JSON.parse(raw);
          setSavedConversations(parsed);
          const activeId = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_ID);
          if (activeId) {
            const current = parsed.find((c) => c.id === activeId);
            if (current && current.messages.length > 0) {
              setActiveConversationId(current.id);
              setMessages(current.messages);
            }
          }
        }
      } catch {
        // Fallback to initial state
      }
    }
    void loadStoredHistory();
  }, []);

  // Save current messages to AsyncStorage
  const persistConversation = useCallback(async (convId: string, updatedMsgs: ChatMessage[]) => {
    try {
      const firstUserMsg = updatedMsgs.find((m) => m.sender === 'user');
      const title = firstUserMsg ? firstUserMsg.text.slice(0, 36) + '...' : 'Financial Intelligence Chat';
      const nowFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

      setSavedConversations((prev) => {
        const existingIdx = prev.findIndex((c) => c.id === convId);
        let updated: StoredConversation[];
        if (existingIdx >= 0) {
          updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            title: updated[existingIdx].title === 'New Conversation' ? title : updated[existingIdx].title,
            updatedAt: nowFormatted,
            messages: updatedMsgs,
          };
        } else {
          updated = [
            {
              id: convId,
              title,
              updatedAt: nowFormatted,
              messages: updatedMsgs,
            },
            ...prev,
          ];
        }
        void AsyncStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(updated)).catch(() => {});
        void AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ID, convId).catch(() => {});
        return updated;
      });
    } catch {
      // Storage failure non-blocking
    }
  }, []);

  const handleSend = async (queryText: string) => {
    const textToSend = queryText.trim();
    if (!textToSend || loading) return;

    setInputText('');
    const nowTime = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: nowTime,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    void persistConversation(activeConversationId, nextMessages);

    setLoading(true);

    try {
      const responseData = await queryCopilot(textToSend);

      const assistantMsg: ChatMessage = {
        id: `assist-${Date.now()}`,
        sender: 'assistant',
        text: responseData.answer || 'Here is the financial analysis grounded in your data.',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        data: responseData,
      };

      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      void persistConversation(activeConversationId, finalMessages);
    } catch {
      const fallbackMsg: ChatMessage = {
        id: `assist-${Date.now()}`,
        sender: 'assistant',
        text: "Couldn't reach Assay just now, so I don't have a figure from your transactions. Try the question again.",
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      };

      const finalMessages = [...nextMessages, fallbackMsg];
      setMessages(finalMessages);
      void persistConversation(activeConversationId, finalMessages);
    } finally {
      setLoading(false);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleStartNewChat = () => {
    const newId = `chat-${Date.now()}`;
    setActiveConversationId(newId);
    setMessages([INITIAL_WELCOME_MESSAGE]);
    setHistoryModalVisible(false);
    void AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ID, newId).catch(() => {});
  };

  const handleSelectPastConversation = (conv: StoredConversation) => {
    setActiveConversationId(conv.id);
    setMessages(conv.messages);
    setHistoryModalVisible(false);
    void AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ID, conv.id).catch(() => {});
  };

  const handleConfirmClearChat = () => {
    setMenuVisible(false);
    Alert.alert(
      'Clear Conversation',
      'Are you sure you want to clear the messages in this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setMessages([INITIAL_WELCOME_MESSAGE]);
            void persistConversation(activeConversationId, [INITIAL_WELCOME_MESSAGE]);
          },
        },
      ]
    );
  };

  const hasOnlyWelcome = messages.length === 1 && messages[0].id === 'welcome-1';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 2. Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft color={COLORS.primary} size={26} />
        </TouchableOpacity>

        {/* Three Vertically Aligned Gold Dots */}
        <TouchableOpacity
          style={styles.goldDotsBtn}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <View style={styles.goldDot} />
          <View style={styles.goldDot} />
          <View style={styles.goldDot} />
        </TouchableOpacity>
      </View>

      <View style={styles.titleSection}>
        <Typography variant="h1" color={COLORS.primary} style={styles.pageTitle}>
          ASSAY Copilot
        </Typography>
        <Typography variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
          Your personal financial intelligence assistant.
        </Typography>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        {/* Chat Scroll Area */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isWelcome = msg.id === 'welcome-1';

            if (isUser) {
              return (
                <View key={msg.id} style={styles.userMessageRow}>
                  <View style={styles.userBubble}>
                    <Typography variant="body" style={styles.userText}>
                      {msg.text}
                    </Typography>
                    <Typography variant="caption" style={styles.userTimestamp}>
                      {msg.timestamp}
                    </Typography>
                  </View>
                </View>
              );
            }

            // Assistant Message
            return (
              <View key={msg.id} style={styles.assistantMessageRow}>
                {/* Gold Sparkle Avatar */}
                <View style={styles.avatarCircle}>
                  <Sparkles color={COLORS.gold} size={18} />
                </View>

                <View style={styles.assistantBubble}>
                  <Typography variant="body" color={COLORS.primary} style={styles.assistantText}>
                    {msg.text}
                  </Typography>

                  {/* Audited Intelligence 4-Part Structure if available */}
                  {msg.data && (
                    <View style={styles.auditContainer}>
                      {/* What We Know */}
                      {msg.data.what_we_know && msg.data.what_we_know.length > 0 && (
                        <View style={styles.evidenceBox}>
                          <Typography variant="caption" color={COLORS.primary} style={styles.auditSectionHeading}>
                            Supporting Evidence
                          </Typography>
                          {msg.data.what_we_know.map((item, idx) => (
                            <View key={idx} style={styles.evidenceItemRow}>
                              <Typography variant="caption" color={COLORS.textSecondary}>
                                • {item.label}:
                              </Typography>
                              <Typography variant="caption" color={COLORS.primary} style={{ fontFamily: FONTS.bodyBold }}>
                                {item.value}
                              </Typography>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* What May Happen */}
                      {msg.data.what_may_happen && (
                        <View style={styles.contextBox}>
                          <Typography variant="caption" color={COLORS.textSecondary} style={{ lineHeight: 18 }}>
                            {msg.data.what_may_happen}
                          </Typography>
                        </View>
                      )}

                      {/* Next Step / Action */}
                      {msg.data.what_you_can_do && (
                        <TouchableOpacity
                          style={styles.actionChip}
                          onPress={() => {
                            if (msg.data?.what_you_can_do?.action_url) {
                              router.push(msg.data.what_you_can_do.action_url as any);
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <Typography variant="caption" color={COLORS.primary} style={{ fontFamily: FONTS.bodyBold }}>
                            {msg.data.what_you_can_do.action_label || 'Update My Plan →'}
                          </Typography>
                        </TouchableOpacity>
                      )}

                      {/* Audit Verification Footer */}
                      <View style={styles.auditFooter}>
                        <ShieldCheck color={COLORS.gold} size={14} />
                        <Typography variant="caption" color={COLORS.textSecondary} style={styles.auditFooterText}>
                          Audited by ASSAY Deterministic Pipeline
                        </Typography>
                      </View>
                    </View>
                  )}

                  <Typography variant="caption" color={COLORS.textSecondary} style={styles.assistantTimestamp}>
                    {msg.timestamp}
                  </Typography>
                </View>
              </View>
            );
          })}

          {/* Loading Indicator when awaiting response */}
          {loading && (
            <View style={styles.assistantMessageRow}>
              <View style={styles.avatarCircle}>
                <Sparkles color={COLORS.gold} size={18} />
              </View>
              <View style={[styles.assistantBubble, { paddingVertical: 14 }]}>
                <ActivityIndicator color={COLORS.gold} size="small" />
              </View>
            </View>
          )}

          {/* 4. Suggested Questions Pills (shown when chat is pristine or suggestions ready) */}
          {hasOnlyWelcome && (
            <View style={styles.suggestionsContainer}>
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.suggestionPill}
                  onPress={() => handleSend(q)}
                  activeOpacity={0.7}
                >
                  <ArrowRight color={COLORS.gold} size={16} style={{ marginRight: 8 }} />
                  <Typography variant="body" color={COLORS.primary} style={styles.suggestionText}>
                    {q}
                  </Typography>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* 5. Message Composer */}
        <View style={styles.composerWrapper}>
          <View style={styles.composerBar}>
            {/* Attachment Icon */}
            <TouchableOpacity
              style={styles.attachBtn}
              activeOpacity={0.7}
              onPress={() => Alert.alert('Audited Ledger', 'Copilot is automatically connected to your verified bank balances and transactions.')}
            >
              <Paperclip color={COLORS.primary} size={20} />
            </TouchableOpacity>

            {/* Input */}
            <TextInput
              style={styles.composerInput}
              placeholder="Ask a question about your finances..."
              placeholderTextColor="#9CA3AF"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => handleSend(inputText)}
              returnKeyType="send"
              multiline={false}
            />

            {/* Circular Gold Send Button */}
            <TouchableOpacity
              style={[
                styles.sendBtnCircle,
                { opacity: inputText.trim() || loading ? 1 : 0.6 },
              ]}
              onPress={() => handleSend(inputText)}
              disabled={!inputText.trim() || loading}
              activeOpacity={0.8}
            >
              <ArrowRight color="#FFFFFF" size={18} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 3. Three-dot Menu Modal (Anchored to top-right) */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.anchoredMenuCard}>
            {/* Option 1: Past Conversations */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setHistoryModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <BookOpen color={COLORS.primary} size={18} style={styles.menuIcon} />
              <Typography variant="body" color={COLORS.primary} style={styles.menuItemText}>
                Past Conversations
              </Typography>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Option 2: Clear Chat */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleConfirmClearChat}
              activeOpacity={0.7}
            >
              <Trash2 color={COLORS.primary} size={18} style={styles.menuIcon} />
              <Typography variant="body" color={COLORS.primary} style={styles.menuItemText}>
                Clear Chat
              </Typography>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Option 3: Settings */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setSettingsModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Settings color={COLORS.primary} size={18} style={styles.menuIcon} />
              <Typography variant="body" color={COLORS.primary} style={styles.menuItemText}>
                Settings
              </Typography>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Past Conversations Panel / Modal */}
      <Modal
        visible={historyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.historyModalOverlay}>
          <View style={styles.historyModalCard}>
            <View style={styles.modalHeader}>
              <Typography variant="h2" color={COLORS.primary} style={{ fontFamily: FONTS.heading }}>
                Past Conversations
              </Typography>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <X color={COLORS.primary} size={22} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.newChatBtn}
              onPress={handleStartNewChat}
              activeOpacity={0.8}
            >
              <Plus color="#FFFFFF" size={18} />
              <Typography variant="bodyBold" style={{ color: '#FFFFFF', marginLeft: 8 }}>
                Start New Chat
              </Typography>
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 340, marginTop: 12 }}>
              {savedConversations.length === 0 ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <Clock color={COLORS.textSecondary} size={28} style={{ marginBottom: 8 }} />
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    No saved past conversations yet.
                  </Typography>
                </View>
              ) : (
                savedConversations.map((conv) => (
                  <TouchableOpacity
                    key={conv.id}
                    style={[
                      styles.historyItemRow,
                      activeConversationId === conv.id && styles.historyItemRowActive,
                    ]}
                    onPress={() => handleSelectPastConversation(conv)}
                  >
                    <View style={{ flex: 1 }}>
                      <Typography variant="bodyBold" color={COLORS.primary} numberOfLines={1}>
                        {conv.title}
                      </Typography>
                      <Typography variant="caption" color={COLORS.textSecondary}>
                        {conv.updatedAt} • {conv.messages.length} messages
                      </Typography>
                    </View>
                    <ChevronRight color={COLORS.textSecondary} size={18} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Copilot Settings Modal */}
      <Modal
        visible={settingsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <View style={styles.historyModalOverlay}>
          <View style={styles.historyModalCard}>
            <View style={styles.modalHeader}>
              <Typography variant="h2" color={COLORS.primary} style={{ fontFamily: FONTS.heading }}>
                Copilot Settings
              </Typography>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
                <X color={COLORS.primary} size={22} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 14, marginTop: 12 }}>
              <View style={styles.settingsRow}>
                <View style={{ flex: 1 }}>
                  <Typography variant="bodyBold" color={COLORS.primary}>
                    Audited Explanations
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Always link answers to verified transaction ledgers.
                  </Typography>
                </View>
                <Check color={COLORS.gold} size={20} />
              </View>

              <View style={styles.settingsRow}>
                <View style={{ flex: 1 }}>
                  <Typography variant="bodyBold" color={COLORS.primary}>
                    Conservative Headroom
                  </Typography>
                  <Typography variant="caption" color={COLORS.textSecondary}>
                    Account for upcoming contractual bills before payday.
                  </Typography>
                </View>
                <Check color={COLORS.gold} size={20} />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.newChatBtn, { marginTop: 20 }]}
              onPress={() => setSettingsModalVisible(false)}
            >
              <Typography variant="bodyBold" style={{ color: '#FFFFFF' }}>
                Done
              </Typography>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  // Three vertically aligned gold dots
  goldDotsBtn: {
    width: 36,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3.5,
  },
  goldDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: '#D6A928', // Assay Gold
  },
  titleSection: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  pageTitle: {
    fontFamily: FONTS.heading,
    fontSize: 28,
    color: COLORS.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
  },
  // Messages
  userMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: COLORS.primary, // Deep Navy
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    lineHeight: 21,
  },
  userTimestamp: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  assistantMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FAF4E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  assistantBubble: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#EFEFEA',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 6px rgba(0,0,0,0.03)',
      },
    }),
  },
  assistantText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.primary,
  },
  assistantTimestamp: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'right',
  },
  // Audited Intelligence Details
  auditContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    gap: 8,
  },
  auditSectionHeading: {
    fontFamily: FONTS.bodyBold,
    marginBottom: 4,
  },
  evidenceBox: {
    backgroundColor: '#FAF9F6',
    padding: 10,
    borderRadius: 10,
  },
  evidenceItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  contextBox: {
    paddingHorizontal: 2,
  },
  actionChip: {
    backgroundColor: '#FAF4E5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  auditFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  auditFooterText: {
    fontSize: 11,
    color: '#6B7280',
  },
  // Suggestions
  suggestionsContainer: {
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#EFEFEA',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
      },
    }),
  },
  suggestionText: {
    fontSize: 13.5,
    fontFamily: FONTS.bodyMedium,
  },
  // Message Composer
  composerWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FAF9F6',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      },
    }),
  },
  attachBtn: {
    padding: 8,
  },
  composerInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontFamily: FONTS.body,
    color: COLORS.primary,
  },
  sendBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#9A7818', // Gold Accent matching reference
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Three-dot Anchored Menu
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  anchoredMenuCard: {
    position: 'absolute',
    top: 54,
    right: 18,
    width: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
      },
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuIcon: {
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  // History Modal
  historyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  historyModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 12,
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FAF9F6',
    marginBottom: 8,
  },
  historyItemRowActive: {
    borderColor: COLORS.gold,
    borderWidth: 1,
    backgroundColor: '#FAF4E5',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
});

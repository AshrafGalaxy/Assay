import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Typography } from '../../components/Typography';
import { COLORS } from '../../constants/theme';
import { ChevronLeft, Cloud, Smartphone, Check } from 'lucide-react-native';
import { fetchAiPreference, saveAiPreference, AiPreference } from '../../services/finance';

export default function AiModelScreen() {
  const router = useRouter();
  const [preference, setPreference] = useState<AiPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'local' | 'cloud' | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setPreference(await fetchAiPreference());
    } catch {
      Alert.alert('Could not load AI settings', 'Check that the Assay backend is running, then try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const choose = async (mode: 'local' | 'cloud') => {
    if (!preference || preference.mode === mode || saving) return;
    const previous = preference;
    setPreference({ ...preference, mode });
    setSaving(mode);
    try {
      setPreference(await saveAiPreference(mode));
    } catch {
      setPreference(previous);
      Alert.alert('Could not save', 'The model choice was not saved. Try again.');
    } finally {
      setSaving(null);
    }
  };

  const mode = preference?.mode ?? 'local';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ChevronLeft color={COLORS.text} size={24} />
        </TouchableOpacity>
        <Typography variant="h3" style={styles.headerTitle}>
          AI Model
        </Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Typography variant="body" color={COLORS.textSecondary} style={styles.intro}>
          Copilot always calculates from your transactions. This choice only decides which model writes the answer.
        </Typography>

        {loading || !preference ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: 32 }} />
        ) : (
          <>
            <ModelCard
              title="On this device"
              detail={preference.local_model_name}
              description="Answers are written on this machine. Your question is not sent to a cloud model."
              status={
                preference.local_status
                ?? (preference.local_available
                  ? 'Ready'
                  : 'Model file is not on this computer yet. Copilot keeps the verified answer until it is.')
              }
              ready={preference.local_available}
              selected={mode === 'local'}
              busy={saving === 'local'}
              onPress={() => void choose('local')}
            />
            <ModelCard
              title="Cloud"
              detail={preference.cloud_model_name}
              description="Answers are written by Groq or Hugging Face, using the same verified numbers."
              status={
                preference.cloud_available
                  ? 'Ready'
                  : 'No cloud key is configured. Copilot keeps the verified answer until one is.'
              }
              ready={preference.cloud_available}
              selected={mode === 'cloud'}
              busy={saving === 'cloud'}
              onPress={() => void choose('cloud')}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ModelCard({
  title,
  detail,
  description,
  status,
  ready,
  selected,
  busy,
  onPress,
}: {
  title: string;
  detail: string;
  description: string;
  status: string;
  ready: boolean;
  selected: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const Icon = title === 'Cloud' ? Cloud : Smartphone;
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={styles.iconBox}>
          <Icon color={selected ? COLORS.gold : COLORS.text} size={22} />
        </View>
        <View style={styles.cardTitles}>
          <Typography variant="bodyBold">{title}</Typography>
          <Typography variant="caption" color={COLORS.textSecondary}>
            {detail}
          </Typography>
        </View>
        {busy ? (
          <ActivityIndicator color={COLORS.gold} />
        ) : selected ? (
          <View style={styles.check}>
            <Check color="#FFFFFF" size={14} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Typography variant="body" color={COLORS.textSecondary} style={styles.description}>
        {description}
      </Typography>
      <Typography variant="caption" color={ready ? COLORS.success : COLORS.warning}>
        {status}
      </Typography>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    color: COLORS.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  intro: {
    marginBottom: 20,
    lineHeight: 22,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  cardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: '#FAF9F5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitles: {
    flex: 1,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    marginTop: 12,
    lineHeight: 21,
  },
});

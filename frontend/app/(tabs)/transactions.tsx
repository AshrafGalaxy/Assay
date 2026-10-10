import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Typography } from '../../components/Typography';
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { COLORS } from '../../constants/theme';
import { API_BASE_URL } from '../../services/api';
import {
  ApiTransaction,
  fetchTransactions,
  formatSignedINR,
  groupTransactionsByDate,
} from '../../services/finance';
import { Search } from 'lucide-react-native';

const FILTERS = ['All', 'Income', 'Debit', 'Recurring'] as const;

export default function TransactionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; filter?: string }>();
  const [activeFilter, setActiveFilter] = useState<string>(params.filter || 'All');
  const [searchQuery, setSearchQuery] = useState(params.query || '');
  const [items, setItems] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchTransactions(100);
      setItems(data.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load transactions';
      setError(`${message} (API: ${API_BASE_URL})`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (params.query) setSearchQuery(params.query);
    if (params.filter) setActiveFilter(params.filter);
  }, [params.query, params.filter]);

  const filteredGroups = useMemo(() => {
    const filtered = items.filter((item) => {
      const isIncome = item.type === 'credit';
      const matchesFilter =
        activeFilter === 'All' ||
        (activeFilter === 'Income' && isIncome) ||
        (activeFilter === 'Debit' && !isIncome) ||
        (activeFilter === 'Recurring' && item.is_recurring);
      const haystack = `${item.merchant_name} ${item.category} ${item.description || ''} ${item.amount}`.toLowerCase();
      const matchesSearch = haystack.includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
    return groupTransactionsByDate(filtered);
  }, [items, activeFilter, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Typography variant="pageTitle" style={styles.pageTitle}>
          Transactions
        </Typography>

        <View style={styles.searchBar}>
          <Search color="#9CA3AF" size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search merchant, amount, category..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterPill, isActive ? styles.filterPillActive : styles.filterPillInactive]}
                onPress={() => setActiveFilter(filter)}
                activeOpacity={0.8}
              >
                <Typography
                  variant="caption"
                  style={[styles.filterText, isActive ? styles.filterTextActive : styles.filterTextInactive]}
                >
                  {filter}
                </Typography>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {loading && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Typography variant="caption" color={COLORS.textSecondary}>
              Loading synthetic ledger…
            </Typography>
          </View>
        )}

        {error && (
          <Typography variant="caption" color={COLORS.error} style={styles.errorText}>
            {error}
          </Typography>
        )}

        {!loading && !error && filteredGroups.length === 0 && (
          <Typography variant="secondary" color={COLORS.textSecondary}>
            No transactions match this filter.
          </Typography>
        )}

        {filteredGroups.map((group) => (
          <View key={group.date} style={styles.groupContainer}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.dateHeader}>
              {group.label}
            </Typography>

            {group.items.map((item) => {
              const isIncome = item.type === 'credit';
              const amount = formatSignedINR(item.amount, isIncome);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.transactionCard}
                  activeOpacity={0.75}
                  onPress={() =>
                    router.push({
                      pathname: '/transaction/[id]',
                      params: {
                        id: item.id,
                        name: item.merchant_name || item.category,
                        merchantKey: 'receipt',
                        amount,
                        time: item.transaction_date,
                        method: isIncome ? 'Bank' : 'UPI',
                        category: item.category,
                        notes: item.description || item.source_type,
                      },
                    })
                  }
                >
                  <MerchantLogo name={item.category} size={44} style={styles.merchantLogo} />

                  <View style={styles.transactionDetails}>
                    <Typography variant="bodyBold" style={styles.merchantName}>
                      {item.merchant_name || item.category}
                    </Typography>
                    <Typography variant="caption" color={COLORS.textSecondary}>
                      {item.category}
                      {item.is_recurring ? ' • Recurring' : ''}
                    </Typography>
                  </View>

                  <Typography
                    variant="financial"
                    style={[styles.amountText, isIncome && { color: COLORS.success }]}
                  >
                    {amount}
                  </Typography>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: {
    fontSize: 34,
    marginBottom: 16,
    color: COLORS.text,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterPillInactive: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  filterTextInactive: {
    color: COLORS.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  errorText: {
    marginBottom: 12,
  },
  groupContainer: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 14,
    marginBottom: 10,
    marginLeft: 2,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 10,
  },
  merchantLogo: {
    marginRight: 14,
  },
  transactionDetails: {
    flex: 1,
  },
  merchantName: {
    fontSize: 16,
    marginBottom: 4,
    color: COLORS.text,
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
});

import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Typography } from '../../components/Typography';
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import { Search } from 'lucide-react-native';
import { useTransactions, Transaction } from '../../services/transactions';

interface TransactionItemData {
  id: string;
  name: string;
  merchantKey: string;
  time: string;
  method: string;
  amount: string;
  isIncome?: boolean;
  category?: string;
  notes?: string;
  sourceType?: string;
  bankKey?: string;
  accountName?: string;
}

interface DateGroup {
  date: string;
  items: TransactionItemData[];
}

const FILTERS = ['All', 'UPI', 'Card', 'Cash', 'Bank', 'Wallet'] as const;

function groupTransactionsByDate(txList: Transaction[]): DateGroup[] {
  const groups: Record<string, TransactionItemData[]> = {};
  const order: string[] = [];

  for (const tx of txList) {
    let dateLabel = 'Today';
    let timeLabel = tx.transaction_date;

    if (tx.transaction_date.includes('Today')) {
      dateLabel = 'Today';
      timeLabel = tx.transaction_date.replace('Today,', '').trim();
    } else if (tx.transaction_date.includes('Yesterday')) {
      dateLabel = 'Yesterday';
      timeLabel = tx.transaction_date.replace('Yesterday,', '').trim();
    } else if (tx.transaction_date.includes('-')) {
      const d = new Date(tx.transaction_date);
      if (!isNaN(d.getTime())) {
        const today = new Date();
        if (d.toDateString() === today.toDateString()) {
          dateLabel = 'Today';
        } else {
          dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        }
        timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      dateLabel = tx.transaction_date.split(',')[0] || 'Recent';
      timeLabel = tx.transaction_date.split(',')[1]?.trim() || '';
    }

    if (!groups[dateLabel]) {
      groups[dateLabel] = [];
      order.push(dateLabel);
    }

    const isCredit = tx.type === 'credit';
    const amountStr = `${isCredit ? '+' : '-'}₹${Number(tx.amount).toLocaleString('en-IN')}`;

    groups[dateLabel].push({
      id: tx.id,
      name: tx.merchant_name,
      merchantKey: tx.merchant_name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      time: timeLabel || 'Recent',
      method: tx.payment_method || 'UPI',
      amount: amountStr,
      isIncome: isCredit,
      category: tx.category,
      notes: tx.description,
      sourceType: tx.source_type,
      bankKey: tx.bank_key,
      accountName: tx.account_name,
    });
  }

  return order.map((date) => ({
    date,
    items: groups[date],
  }));
}

export default function TransactionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; filter?: string }>();
  const { transactions } = useTransactions();

  const [activeFilter, setActiveFilter] = useState<string>(params.filter || 'All');
  const [searchQuery, setSearchQuery] = useState(params.query || '');

  useEffect(() => {
    if (params.query) {
      setSearchQuery(params.query);
    }
    if (params.filter) {
      setActiveFilter(params.filter);
    }
  }, [params.query, params.filter]);

  const rawGroups = useMemo(() => groupTransactionsByDate(transactions), [transactions]);

  const filteredGroups = useMemo(() => {
    return rawGroups
      .map((group) => {
        const items = group.items.filter((item) => {
          const matchesFilter =
            activeFilter === 'All' ||
            item.method.toLowerCase() === activeFilter.toLowerCase();
          const query = searchQuery.toLowerCase();
          const matchesSearch =
            !query ||
            item.name.toLowerCase().includes(query) ||
            item.amount.includes(query) ||
            item.method.toLowerCase().includes(query) ||
            (item.category && item.category.toLowerCase().includes(query)) ||
            (item.accountName && item.accountName.toLowerCase().includes(query));
          return matchesFilter && matchesSearch;
        });
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [rawGroups, activeFilter, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Typography variant="pageTitle" style={styles.pageTitle}>
          Transactions
        </Typography>

        {/* Search Bar */}
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

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((filter) => {
            const isActive = activeFilter.toLowerCase() === filter.toLowerCase();
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterPill,
                  isActive ? styles.filterPillActive : styles.filterPillInactive,
                ]}
                onPress={() => setActiveFilter(filter)}
                activeOpacity={0.8}
              >
                <Typography
                  variant="caption"
                  style={[
                    styles.filterText,
                    isActive ? styles.filterTextActive : styles.filterTextInactive,
                  ]}
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
      >
        {filteredGroups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Typography variant="bodyMedium" color={COLORS.textSecondary}>
              No transactions match your search.
            </Typography>
          </View>
        ) : null}

        {filteredGroups.map((group) => (
          <View key={group.date} style={styles.groupContainer}>
            <Typography variant="caption" color={COLORS.textSecondary} style={styles.dateHeader}>
              {group.date}
            </Typography>

            {group.items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.transactionCard}
                activeOpacity={0.75}
                onPress={() =>
                  router.push({
                    pathname: `/transaction/${item.id}`,
                    params: {
                      name: item.name,
                      merchantKey: item.merchantKey,
                      amount: item.amount,
                      time: item.time,
                      method: item.method,
                      category: item.category || 'General',
                      notes: item.notes || '',
                    },
                  })
                }
              >
                <MerchantLogo name={item.merchantKey} size={44} style={styles.merchantLogo} />

                <View style={styles.transactionDetails}>
                  <Typography
                    variant="bodyBold"
                    style={styles.merchantName}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color={COLORS.textSecondary}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.time} • {item.method} • {item.category}{item.accountName ? ` • ${item.accountName}` : ''}
                  </Typography>
                </View>

                <View style={styles.amountContainer}>
                  <Typography
                    variant="financial"
                    style={[
                      styles.amountText,
                      item.isIncome ? styles.amountTextIncome : null,
                    ]}
                  >
                    {item.amount}
                  </Typography>
                </View>
              </TouchableOpacity>
            ))}
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
    paddingHorizontal: 20,
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
    flexShrink: 0,
  },
  transactionDetails: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  merchantName: {
    fontSize: 15,
    fontFamily: FONTS.bodyBold,
    color: COLORS.text,
    marginBottom: 4,
  },
  amountContainer: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 70,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
  },
  amountTextIncome: {
    color: '#16A34A',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
});

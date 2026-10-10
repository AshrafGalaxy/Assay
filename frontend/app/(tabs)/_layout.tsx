import React from 'react';
import { Tabs } from 'expo-router';
import { FloatingTabBar } from '../../components/ui/FloatingTabBar';

const renderFloatingTabBar = (props: any) => <FloatingTabBar {...props} />;

export default function TabLayout() {
  return (
    <Tabs
      tabBar={renderFloatingTabBar}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Upload',
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}

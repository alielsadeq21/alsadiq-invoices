'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import LoginPage from '@/components/app/login-page';
import AppLayout from '@/components/app/app-layout';
import DashboardPage from '@/components/app/dashboard-page';
import BranchesPage from '@/components/app/branches-page';
import ProductsPage from '@/components/app/products-page';
import InvoiceFormPage from '@/components/app/invoice-form-page';
import InvoicesPage from '@/components/app/invoices-page';
import InvoiceDetailPage from '@/components/app/invoice-detail-page';
import ReturnsPage from '@/components/app/returns-page';
import ReportsPage from '@/components/app/reports-page';
import SettingsPage from '@/components/app/settings-page';

export default function Home() {
  const { isLoggedIn, currentPage, checkAuth } = useAppStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'branches':
        return <BranchesPage />;
      case 'products':
        return <ProductsPage />;
      case 'invoices':
        return <InvoicesPage />;
      case 'invoice-form':
        return <InvoiceFormPage />;
      case 'invoice-detail':
        return <InvoiceDetailPage />;
      case 'returns':
        return <ReturnsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return <AppLayout>{renderPage()}</AppLayout>;
}

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { ProtectedRoute, PublicOnlyRoute, RoleRoute } from './ProtectedRoute';
import AppLayout from '@/layouts/AppLayout';

import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import ResetPassword from '@/pages/auth/ResetPassword';

/**
 * Carregamento tardio das telas "pesadas".
 * O login entra no bundle inicial (é a primeira tela de quem chega) e o resto
 * é baixado sob demanda — o app abre rápido até no 3G.
 */
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Train = lazy(() => import('@/pages/Train'));
const Simulados = lazy(() => import('@/pages/Simulados'));
const SimuladoRun = lazy(() => import('@/pages/SimuladoRun'));
const SimuladoResult = lazy(() => import('@/pages/SimuladoResult'));
const ErrorNotebook = lazy(() => import('@/pages/ErrorNotebook'));
const Favorites = lazy(() => import('@/pages/Favorites'));
const Progress = lazy(() => import('@/pages/Progress'));
const Theory = lazy(() => import('@/pages/Theory'));
const Plan = lazy(() => import('@/pages/Plan'));
const Trilhas = lazy(() => import('@/pages/Trilhas'));
const Ranking = lazy(() => import('@/pages/Ranking'));
const AiTutor = lazy(() => import('@/pages/AiTutor'));
const Settings = lazy(() => import('@/pages/Settings'));

const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminQuestions = lazy(() => import('@/pages/admin/AdminQuestions'));
const AdminContent = lazy(() => import('@/pages/admin/AdminContent'));
const AdminLogs = lazy(() => import('@/pages/admin/AdminLogs'));

const NotFound = lazy(() => import('@/pages/NotFound'));

export default function AppRoutes() {
  return (
    <Suspense fallback={<Spinner label="Carregando..." />}>
      <Routes>
        {/* ------------------------------- públicas ------------------------------ */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Register />} />
          <Route path="/esqueci-senha" element={<ForgotPassword />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
        </Route>

        {/* ----------------------------- autenticadas ---------------------------- */}
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="treinar" element={<Train />} />
            <Route path="simulados" element={<Simulados />} />
            <Route path="simulados/:id" element={<SimuladoRun />} />
            <Route path="simulados/:id/resultado" element={<SimuladoResult />} />
            <Route path="caderno" element={<ErrorNotebook />} />
            <Route path="favoritas" element={<Favorites />} />
            <Route path="progresso" element={<Progress />} />
            <Route path="teoria" element={<Theory />} />
            <Route path="plano" element={<Plan />} />
            <Route path="trilhas" element={<Trilhas />} />
            <Route path="ranking" element={<Ranking />} />
            <Route path="ia" element={<AiTutor />} />
            <Route path="configuracoes" element={<Settings />} />

            {/* -------------------------- administração ------------------------- */}
            <Route element={<RoleRoute roles={['ADMIN']} />}>
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="admin/usuarios" element={<AdminUsers />} />
              <Route path="admin/conteudo" element={<AdminContent />} />
              <Route path="admin/logs" element={<AdminLogs />} />
            </Route>

            <Route element={<RoleRoute roles={['ADMIN', 'EDITOR']} />}>
              <Route path="admin/questoes" element={<AdminQuestions />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

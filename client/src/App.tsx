import { Switch, Route, Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';

import Blog from './pages/Blog';
import CategoryPage from './pages/CategoryPage';
import PostPage from './pages/PostPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminPosts from './pages/AdminPosts';
import AdminPostEditor from './pages/AdminPostEditor';
import AdminAffiliates from './pages/AdminAffiliates';
import AdminTokens from './pages/AdminTokens';
import AdminAnalytics from './pages/AdminAnalytics';
import NotFound from './pages/not-found';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={Blog} />
          <Route path="/category/:slug" component={CategoryPage} />
          <Route path="/post/:slug" component={PostPage} />
          <Route path="/admin" component={AdminLogin} />
          <Route path="/admin/dashboard" component={AdminDashboard} />
          <Route path="/admin/posts" component={AdminPosts} />
          <Route path="/admin/posts/new" component={AdminPostEditor} />
          <Route path="/admin/posts/:id/edit" component={AdminPostEditor} />
          <Route path="/admin/affiliates" component={AdminAffiliates} />
          <Route path="/admin/tokens" component={AdminTokens} />
          <Route path="/admin/analytics" component={AdminAnalytics} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

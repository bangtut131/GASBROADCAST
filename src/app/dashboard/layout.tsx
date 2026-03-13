import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import type { Profile, Tenant } from '@/types';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // Fetch profile and tenant
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    let tenant = null;
    if (profile?.tenant_id) {
        const { data } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', profile.tenant_id)
            .single();
        tenant = data;
    }
    // Check if user is a platform superadmin
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const isAdmin = !!(user.email && adminEmails.includes(user.email.toLowerCase()));
    
    // Get the plan (default 'free')
    const plan = tenant?.plan || 'free';

    return (
        <div className="dashboard-layout">
            <Sidebar isAdmin={isAdmin} plan={plan} />
            <div className="dashboard-main">
                <Header profile={profile as Profile} tenant={tenant as Tenant} />
                <main className="dashboard-content">
                    {children}
                </main>
            </div>

            <style>{`
        .dashboard-layout {
          display: flex;
          min-height: 100vh;
        }
        .dashboard-main {
          flex: 1;
          margin-left: var(--sidebar-width);
          display: flex;
          flex-direction: column;
          transition: margin-left var(--transition-slow);
        }
        .dashboard-content {
          flex: 1;
          padding: var(--space-6);
          animation: fadeInUp 0.3s ease;
        }
      `}</style>
        </div>
    );
}

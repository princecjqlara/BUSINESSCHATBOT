'use client';

import {
    LayoutGrid,
    Settings,
    HelpCircle,
    LogOut,
    Kanban,
    Workflow
} from 'lucide-react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabaseClient';

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const navItems = [
        { icon: LayoutGrid, href: '/', label: 'Dashboard' },
        { icon: Kanban, href: '/pipeline', label: 'Pipeline' },
        { icon: Workflow, href: '/workflows', label: 'Workflows' },
        { icon: Settings, href: '/settings', label: 'Settings' },
    ];

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    return (
        <div className="w-16 bg-[#0d2116] h-screen flex flex-col items-center py-6 text-gray-400 border-r border-[#1a3828] flex-shrink-0">
            <div className="mb-8">
                <Link href="/">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold cursor-pointer">
                        A
                    </div>
                </Link>
            </div>

            <nav className="flex-1 flex flex-col gap-4 w-full items-center">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`p-2 rounded-lg transition-colors ${isActive
                                ? 'text-white bg-white/10'
                                : 'hover:text-white hover:bg-white/10'
                                }`}
                            title={item.label}
                        >
                            <item.icon size={20} />
                        </Link>
                    );
                })}
            </nav>

            <div className="flex flex-col gap-4 w-full items-center mt-auto">
                <button className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Help">
                    <HelpCircle size={20} />
                </button>
                <button
                    onClick={handleLogout}
                    className="p-2 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Logout"
                >
                    <LogOut size={20} />
                </button>
            </div>
        </div>
    );
}


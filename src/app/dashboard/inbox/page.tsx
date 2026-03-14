'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Search, MessageSquare, Send, Smartphone, Bot, User,
    Circle, RefreshCw, Loader2, UserCheck, Trash2, Mail, MailOpen
} from 'lucide-react';

interface Conversation {
    phone: string;
    name: string | null;
    category: string;
    lastMessage: string;
    lastTime: string;
    unread: number;
    deviceId: string | null;
    deviceName: string;
    campaignName: string | null;
}

interface Message {
    id: string;
    content: string | null;
    direction: 'inbound' | 'outbound';
    message_type: string;
    is_from_bot: boolean;
    created_at: string;
}

export default function InboxPage() {
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [filterDevice, setFilterDevice] = useState<string>('all');
    const [filterCampaign, setFilterCampaign] = useState<string>('all');
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [statusGroups, setStatusGroups] = useState<any[]>([]); // New state for status updates
    const [activeTab, setActiveTab] = useState<'chats'|'status'>('chats'); // New tab state
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const supabase = createClient();

    const loadConversations = useCallback(async () => {
        try {
            const res = await fetch('/api/inbox', { cache: 'no-store' });
            const data = await res.json();
            if (data.success) setConversations(data.data);
            
            // Also fetch status groups
            const resStatus = await fetch('/api/inbox/statuses', { cache: 'no-store' });
            const dataStatus = await resStatus.json();
            if (dataStatus.success) setStatusGroups(dataStatus.data);
        } catch { } finally { setLoading(false); }
    }, []);

    const loadMessages = useCallback(async (phone: string) => {
        try {
            const res = await fetch(`/api/inbox/${encodeURIComponent(phone)}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success) setMessages(data.data);
        } catch { }
    }, []);

    useEffect(() => { loadConversations(); }, [loadConversations]);

    useEffect(() => {
        if (selectedPhone && activeTab === 'chats') loadMessages(selectedPhone);
    }, [selectedPhone, activeTab, loadMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ====== Supabase Realtime Subscription ======
    useEffect(() => {
        const channel = supabase
            .channel('inbox-realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    const newMsg = payload.new as Message & { phone: string };
                    // Add to current chat if it matches selected phone
                    if (selectedPhone && newMsg.phone === selectedPhone && activeTab === 'chats') {
                        if (newMsg.message_type === 'status') return; // Do not append statuses to active chat
                        setMessages(prev => {
                            // Avoid duplicate if already added optimistically
                            if (prev.some(m => m.id === newMsg.id)) return prev;
                            return [...prev, newMsg];
                        });
                    }
                    // Refresh conversation list to update last message
                    loadConversations();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
                else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeStatus('error');
            });

        return () => { supabase.removeChannel(channel); };
    }, [selectedPhone, supabase, loadConversations]);

    // ====== Polling fallback (3s conversations, 1.5s messages) ======
    useEffect(() => {
        const convTimer = setInterval(() => loadConversations(), 3000);
        return () => clearInterval(convTimer);
    }, [loadConversations]);

    useEffect(() => {
        if (!selectedPhone || activeTab !== 'chats') return;
        const msgTimer = setInterval(() => loadMessages(selectedPhone), 1500);
        return () => clearInterval(msgTimer);
    }, [selectedPhone, activeTab, loadMessages]);


    const handleSend = async () => {
        if (!newMessage.trim() || !selectedPhone || sending) return;
        setSending(true);
        const optimisticId = `opt-${Date.now()}`;
        const optimistic: Message = {
            id: optimisticId,
            content: newMessage,
            direction: 'outbound',
            message_type: 'text',
            is_from_bot: false,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimistic]);
        const msg = newMessage;
        setNewMessage('');

        try {
            const res = await fetch('/api/inbox/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: selectedPhone, message: msg }),
            });
            if (!res.ok) {
                // Remove optimistic if failed
                setMessages(prev => prev.filter(m => m.id !== optimisticId));
                setNewMessage(msg);
            }
        } catch {
            setMessages(prev => prev.filter(m => m.id !== optimisticId));
            setNewMessage(msg);
        } finally { setSending(false); }
    };

    const handleDeleteConversation = async (phone: string) => {
        if (!confirm('Hapus seluruh percakapan ini?')) return;
        try {
            await fetch(`/api/inbox/${encodeURIComponent(phone)}`, { method: 'DELETE' });
            setSelectedPhone(null);
            setMessages([]);
            loadConversations();
        } catch {}
    };

    const handleDeleteMessage = async (msgId: string) => {
        if (!selectedPhone) return;
        if (!confirm('Hapus pesan ini?')) return;
        try {
            await fetch(`/api/inbox/${encodeURIComponent(selectedPhone)}?id=${msgId}`, { method: 'DELETE' });
            setMessages(prev => prev.filter(m => m.id !== msgId));
            loadConversations();
        } catch {}
    };

    const handleToggleRead = async (phone: string, is_read: boolean) => {
        try {
            await fetch(`/api/inbox/${encodeURIComponent(phone)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_read })
            });
            loadConversations();
        } catch {}
    };

    // Auto mark as read when selecting a conversation that has unread messages
    useEffect(() => {
        if (selectedPhone) {
            const conv = conversations.find(c => c.phone === selectedPhone);
            if (conv && conv.unread > 0) {
                handleToggleRead(selectedPhone, true);
            }
        }
    }, [selectedPhone, conversations]);

    // Compute unique filters
    const uniqueCategories = Array.from(new Set(conversations.map(c => c.category))).filter(Boolean);
    const uniqueDevices = Array.from(new Map(conversations.filter(c => c.deviceId).map(c => [c.deviceId, c.deviceName])).entries());
    const uniqueCampaigns = Array.from(new Set(conversations.map(c => c.campaignName))).filter(Boolean) as string[];

    const filtered = (activeTab === 'chats' ? conversations : statusGroups).filter((c: any) => {
        const matchSearch = (c.name || c.phone).toLowerCase().includes(search.toLowerCase());
        const matchCategory = filterCategory === 'all' || c.category === filterCategory;
        const matchDevice = filterDevice === 'all' || c.deviceId === filterDevice;
        const matchCampaign = activeTab === 'status' ? true : (filterCampaign === 'all' || c.campaignName === filterCampaign);
        return matchSearch && matchCategory && matchDevice && matchCampaign;
    });

    const selectedConv = (activeTab === 'chats' ? conversations : statusGroups).find((c: any) => c.phone === selectedPhone);

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    };

    return (
        <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 120px)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            {/* LEFT: Conversation List */}
            <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                        <h2 style={{ fontSize: 'var(--text-lg)' }}>Inbox</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: realtimeStatus === 'connected' ? 'var(--color-success)' : realtimeStatus === 'error' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                            <Circle size={7} style={{ fill: 'currentColor' }} />
                            {realtimeStatus === 'connected' ? 'Live' : realtimeStatus === 'error' ? 'Offline' : 'Connecting...'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                        <select className="form-input" style={{ flex: 1, padding: 'var(--space-2)', fontSize: 'var(--text-xs)' }} value={filterDevice} onChange={e => setFilterDevice(e.target.value)}>
                            <option value="all">📱 Semua Device</option>
                            {uniqueDevices.map(([id, name]) => (
                                <option key={id || 'unknown'} value={id || 'unknown'}>{name}</option>
                            ))}
                        </select>
                        <select className="form-input" style={{ flex: 1, padding: 'var(--space-2)', fontSize: 'var(--text-xs)' }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                            <option value="all">🏷️ Semua Kategori</option>
                            {uniqueCategories.map(cat => (
                                <option key={cat} value={cat}>{cat === 'uncategorized' ? 'Tanpa Kategori' : cat}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                        <select className="form-input" style={{ flex: 1, padding: 'var(--space-2)', fontSize: 'var(--text-xs)' }} value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)}>
                            <option value="all">📢 Semua Broadcast</option>
                            {uniqueCampaigns.map(camp => (
                                <option key={camp} value={camp}>{camp}</option>
                            ))}
                        </select>
                    </div>

                    <div className="search-wrapper" style={{ maxWidth: '100%', marginBottom: 'var(--space-3)' }}>
                        <Search className="search-icon" size={16} />
                        <input type="text" className="form-input" placeholder="Cari kontak..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
                    </div>
                    
                    {/* TABS */}
                    <div style={{ display: 'flex', gap: 'var(--space-2)', background: 'var(--color-bg-elevated)', padding: 4, borderRadius: 'var(--radius-lg)' }}>
                        <button 
                            style={{ flex: 1, padding: '6px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-md)', fontWeight: 600, background: activeTab === 'chats' ? 'var(--color-bg-primary)' : 'transparent', color: activeTab === 'chats' ? 'var(--color-text-primary)' : 'var(--color-text-muted)', border: 'none', boxShadow: activeTab === 'chats' ? 'var(--shadow-sm)' : 'none', cursor: 'pointer', transition: 'all var(--transition-fast)' }}
                            onClick={() => { setActiveTab('chats'); setSelectedPhone(null); }}
                        >
                            Chats
                        </button>
                        <button 
                            style={{ flex: 1, padding: '6px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-md)', fontWeight: 600, background: activeTab === 'status' ? 'var(--color-bg-primary)' : 'transparent', color: activeTab === 'status' ? 'var(--color-text-primary)' : 'var(--color-text-muted)', border: 'none', boxShadow: activeTab === 'status' ? 'var(--shadow-sm)' : 'none', cursor: 'pointer', transition: 'all var(--transition-fast)' }}
                            onClick={() => { setActiveTab('status'); setSelectedPhone(null); }}
                        >
                            Status WA
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto var(--space-2)' }} />Memuat...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                            <MessageSquare size={32} style={{ color: 'var(--color-text-muted)', margin: '0 auto var(--space-2)' }} />
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                                {conversations.length === 0 ? 'Belum ada pesan masuk' : 'Tidak ditemukan'}
                            </p>
                        </div>
                    ) : (
                        filtered.map((conv: any) => (
                            <div
                                key={conv.phone}
                                onClick={() => setSelectedPhone(conv.phone)}
                                style={{
                                    padding: 'var(--space-3) var(--space-4)',
                                    borderBottom: '1px solid var(--color-border)',
                                    cursor: 'pointer',
                                    background: selectedPhone === conv.phone ? 'var(--color-accent-soft)' : 'transparent',
                                    borderLeft: `3px solid ${selectedPhone === conv.phone ? 'var(--color-accent)' : 'transparent'}`,
                                    transition: 'all var(--transition-fast)',
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="avatar" style={{ width: 40, height: 40, fontSize: 'var(--text-md)', flexShrink: 0, border: activeTab === 'status' ? '2px solid var(--color-accent)' : 'none' }}>
                                        {((conv.name || conv.phone)[0]).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="flex justify-between items-center">
                                            <span style={{ fontWeight: (conv.unread || 0) > 0 ? 700 : 500, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: (conv.unread || 0) > 0 ? 'var(--color-text-primary)' : 'var(--color-text-primary)' }}>
                                                {conv.name || conv.phone}
                                            </span>
                                            <span style={{ fontSize: 10, alignSelf: 'flex-start', color: (conv.unread || 0) > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)', flexShrink: 0, marginLeft: 8, fontWeight: (conv.unread || 0) > 0 ? 600 : 400 }}>
                                                {formatTime(conv.lastTime)}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2, marginBottom: 2 }}>
                                            {conv.category && conv.category !== 'uncategorized' && (
                                                <span style={{ fontSize: 9, background: 'var(--color-border)', padding: '1px 6px', borderRadius: 10, color: 'var(--color-text-muted)' }}>{conv.category}</span>
                                            )}
                                            {conv.campaignName && activeTab === 'chats' && (
                                                <span style={{ fontSize: 9, background: 'var(--color-success)', padding: '1px 6px', borderRadius: 10, color: '#fff' }}>📢 {conv.campaignName}</span>
                                            )}
                                            {conv.deviceName && (
                                                <span style={{ fontSize: 9, background: 'var(--color-accent-soft)', padding: '1px 6px', borderRadius: 10, color: 'var(--color-accent)' }}>via {conv.deviceName}</span>
                                            )}
                                            {activeTab === 'status' && (
                                                <span style={{ fontSize: 9, background: 'var(--color-primary-soft)', padding: '1px 6px', borderRadius: 10, color: 'var(--color-primary)' }}>{conv.statuses?.length || 0} Status</span>
                                            )}
                                        </div>
                                        {activeTab === 'chats' && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <p style={{ fontSize: 'var(--text-xs)', color: (conv.unread || 0) > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: (conv.unread || 0) > 0 ? 500 : 400, flex: 1, paddingRight: 8 }}>
                                                    {conv.lastMessage}
                                                </p>
                                                {(conv.unread || 0) > 0 && (
                                                    <span style={{ background: 'var(--color-accent)', color: 'white', borderRadius: '10px', padding: '2px 6px', fontSize: 10, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                                                        {conv.unread}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* RIGHT: Chat */}
            {selectedPhone ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-bg-primary)' }}>
                    {/* Header */}
                    <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div className="avatar" style={{ width: 40, height: 40 }}>
                            {((selectedConv?.name || selectedPhone)[0]).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>{selectedConv?.name || selectedPhone}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Smartphone size={10} /> {selectedPhone}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                className="btn btn-ghost btn-sm btn-icon" 
                                onClick={() => handleToggleRead(selectedPhone, false)}
                                title="Tandai Belum Dibaca"
                            >
                                <Mail size={16} />
                            </button>
                            <button 
                                className="btn btn-ghost btn-sm btn-icon" 
                                onClick={() => handleDeleteConversation(selectedPhone)}
                                style={{ color: 'var(--color-danger)' }}
                                title="Hapus Percakapan"
                            >
                                <Trash2 size={16} />
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => loadMessages(selectedPhone)}>
                                <RefreshCw size={14} /> Refresh
                            </button>
                        </div>
                    </div>

                    {/* Messages / Status Content */}
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: 'var(--space-4)',
                        background: 'var(--color-bg-primary)',
                        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)'
                    }}>
                        {activeTab === 'chats' ? (
                            <>
                                {messages.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                                        Belum ada pesan
                                    </div>
                                )}
                                {messages.map(msg => (
                                    <div key={msg.id} style={{ display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }} className="group">
                                        {msg.direction === 'outbound' && (
                                            <button 
                                                onClick={() => handleDeleteMessage(msg.id)}
                                                className="btn btn-ghost btn-sm btn-icon" 
                                                style={{ opacity: 0, transition: 'opacity 0.2s', color: 'var(--color-danger)', marginRight: 4, alignSelf: 'center' }}
                                                title="Hapus Pesan"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                        <div style={{ maxWidth: '65%' }}>
                                            {msg.is_from_bot && (
                                                <div style={{ fontSize: 10, color: 'var(--color-accent)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <Bot size={10} /> AI Auto-Reply
                                                </div>
                                            )}
                                            <div style={{
                                                padding: 'var(--space-2) var(--space-3)',
                                                borderRadius: msg.direction === 'outbound' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                                background: msg.direction === 'outbound'
                                                    ? (msg.is_from_bot ? 'rgba(108,99,255,0.85)' : 'var(--color-accent)')
                                                    : 'var(--color-bg-elevated)',
                                                color: msg.direction === 'outbound' ? 'white' : 'var(--color-text-primary)',
                                                fontSize: 'var(--text-sm)', lineHeight: 1.5,
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                                opacity: msg.id.startsWith('opt-') ? 0.7 : 1,
                                            }}>
                                                {msg.content}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, textAlign: msg.direction === 'outbound' ? 'right' : 'left' }}>
                                                {formatTime(msg.created_at)}{msg.id.startsWith('opt-') ? ' · mengirim...' : ''}
                                            </div>
                                        </div>
                                        {msg.direction === 'inbound' && (
                                            <button 
                                                onClick={() => handleDeleteMessage(msg.id)}
                                                className="btn btn-ghost btn-sm btn-icon" 
                                                style={{ opacity: 0, transition: 'opacity 0.2s', color: 'var(--color-danger)', marginLeft: 4, alignSelf: 'center' }}
                                                title="Hapus Pesan"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
                                {selectedConv?.statuses?.map((msg: any) => (
                                    <div key={msg.id} style={{
                                        background: 'var(--color-bg-elevated)',
                                        borderRadius: 'var(--radius-xl)',
                                        padding: 'var(--space-4)',
                                        boxShadow: 'var(--shadow-sm)',
                                        border: '1px solid var(--color-border)',
                                        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--color-accent)', opacity: 0.5 }} />
                                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                                            {formatTime(msg.created_at)}
                                        </div>
                                        <div style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                                            {msg.content || '[Media Status]'}
                                        </div>
                                    </div>
                                ))}
                                {(!selectedConv?.statuses || selectedConv.statuses.length === 0) && (
                                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                                        Tidak ada status tersedia
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    {activeTab === 'chats' && (
                        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
                            <textarea
                                className="form-textarea"
                                style={{ flex: 1, minHeight: 40, maxHeight: 120, resize: 'none', borderRadius: 20, padding: '8px var(--space-4)' }}
                                placeholder="Ketik pesan... (Enter untuk kirim)"
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                rows={1}
                            />
                            <button className="btn btn-primary btn-icon" onClick={handleSend} disabled={sending || !newMessage.trim()} style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }}>
                                <Send size={18} />
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 'var(--space-4)', color: 'var(--color-text-muted)' }}>
                    <MessageSquare size={48} style={{ opacity: 0.3 }} />
                    <p style={{ fontSize: 'var(--text-md)' }}>Pilih percakapan untuk mulai chat</p>
                </div>
            )}
        </div>
    );
}

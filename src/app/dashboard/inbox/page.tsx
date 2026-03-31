'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Search, MessageSquare, Send, Smartphone, Bot, User,
    Circle, RefreshCw, Loader2, UserCheck, Trash2, Mail, MailOpen,
    Paperclip, X, Image as ImageIcon, FileText, Film, Music, Download, ZoomIn
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
    media_url: string | null;
}

interface AttachmentPreview {
    file: File;
    previewUrl: string;
    mediaType: 'image' | 'video' | 'document' | 'audio';
}

export default function InboxPage() {
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [filterDevice, setFilterDevice] = useState<string>('all');
    const [filterCampaign, setFilterCampaign] = useState<string>('all');
    const [conversations, setConversations] = useState<Conversation[]>([]);
    // Status WA tab disabled to reduce memory/bandwidth usage on Railway
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const [attachment, setAttachment] = useState<AttachmentPreview | null>(null);
    const [uploading, setUploading] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    const loadConversations = useCallback(async () => {
        try {
            const res = await fetch('/api/inbox', { cache: 'no-store' });
            const data = await res.json();
            if (data.success) setConversations(data.data);
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
        if (selectedPhone) loadMessages(selectedPhone);
    }, [selectedPhone, loadMessages]);

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
                    if (selectedPhone && newMsg.phone === selectedPhone) {
                        if (newMsg.message_type === 'status') return; // Ignore status messages
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

    // ====== Polling fallback (10s conversations, 5s messages) ======
    useEffect(() => {
        const convTimer = setInterval(() => loadConversations(), 10000);
        return () => clearInterval(convTimer);
    }, [loadConversations]);

    useEffect(() => {
        if (!selectedPhone) return;
        const msgTimer = setInterval(() => loadMessages(selectedPhone), 5000);
        return () => clearInterval(msgTimer);
    }, [selectedPhone, loadMessages]);


    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('File terlalu besar. Maksimal 5MB.');
            return;
        }

        let mediaType: AttachmentPreview['mediaType'] = 'document';
        if (file.type.startsWith('image/')) mediaType = 'image';
        else if (file.type.startsWith('video/')) mediaType = 'video';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';

        const previewUrl = mediaType === 'image' ? URL.createObjectURL(file) : '';
        setAttachment({ file, previewUrl, mediaType });

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const clearAttachment = () => {
        if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        setAttachment(null);
    };

    const handleSend = async () => {
        if ((!newMessage.trim() && !attachment) || !selectedPhone || sending) return;
        setSending(true);

        const optimisticId = `opt-${Date.now()}`;
        const optimistic: Message = {
            id: optimisticId,
            content: newMessage || null,
            direction: 'outbound',
            message_type: attachment?.mediaType || 'text',
            is_from_bot: false,
            created_at: new Date().toISOString(),
            media_url: attachment?.previewUrl || null,
        };
        setMessages(prev => [...prev, optimistic]);
        const msg = newMessage;
        setNewMessage('');
        const currentAttachment = attachment;
        setAttachment(null);

        try {
            let mediaUrl: string | null = null;
            let mediaType: string | null = null;
            let filename: string | null = null;

            // Upload attachment if present
            if (currentAttachment) {
                setUploading(true);
                const formData = new FormData();
                formData.append('file', currentAttachment.file);

                const uploadRes = await fetch('/api/inbox/upload', {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadRes.ok) {
                    const err = await uploadRes.json();
                    throw new Error(err.error || 'Upload gagal');
                }

                const uploadData = await uploadRes.json();
                mediaUrl = uploadData.data.url;
                mediaType = uploadData.data.mediaType;
                filename = currentAttachment.file.name;
                setUploading(false);
            }

            const res = await fetch('/api/inbox/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: selectedPhone,
                    message: msg || null,
                    media_url: mediaUrl,
                    media_type: mediaType,
                    filename,
                }),
            });
            if (!res.ok) {
                setMessages(prev => prev.filter(m => m.id !== optimisticId));
                setNewMessage(msg);
            }
        } catch (err: any) {
            console.error('Send error:', err);
            setMessages(prev => prev.filter(m => m.id !== optimisticId));
            setNewMessage(msg);
            alert(err.message || 'Gagal mengirim pesan');
        } finally {
            setSending(false);
            setUploading(false);
            if (currentAttachment?.previewUrl) URL.revokeObjectURL(currentAttachment.previewUrl);
        }
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

    // Separate normal chats from status@broadcast
    const chatConversations = conversations.filter(c => c.phone !== 'status@broadcast');

    // Compute unique filters
    const uniqueCategories = Array.from(new Set(chatConversations.map(c => c.category))).filter(Boolean);
    const uniqueDevices = Array.from(new Map(chatConversations.filter(c => c.deviceId).map(c => [c.deviceId, c.deviceName])).entries());
    const uniqueCampaigns = Array.from(new Set(chatConversations.map((c: any) => c.campaignName))).filter(Boolean) as string[];

    const filtered = chatConversations.filter((c: any) => {
        const matchSearch = (c.name || c.phone).toLowerCase().includes(search.toLowerCase());
        const matchCategory = filterCategory === 'all' || c.category === filterCategory;
        const matchDevice = filterDevice === 'all' || c.deviceId === filterDevice;
        const matchCampaign = filterCampaign === 'all' || c.campaignName === filterCampaign;
        return matchSearch && matchCategory && matchDevice && matchCampaign;
    });

    const selectedConv = chatConversations.find((c: any) => c.phone === selectedPhone);

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
                    
                    {/* Status WA tab removed to save server resources */}
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
                                    <div className="avatar" style={{ width: 40, height: 40, fontSize: 'var(--text-md)', flexShrink: 0 }}>
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
                                            {conv.campaignName && (
                                                <span style={{ fontSize: 9, background: 'var(--color-success)', padding: '1px 6px', borderRadius: 10, color: '#fff' }}>📢 {conv.campaignName}</span>
                                            )}
                                            {conv.deviceName && (
                                                <span style={{ fontSize: 9, background: 'var(--color-accent-soft)', padding: '1px 6px', borderRadius: 10, color: 'var(--color-accent)' }}>via {conv.deviceName}</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <p style={{ fontSize: 'var(--text-xs)', color: (conv.unread || 0) > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: (conv.unread || 0) > 0 ? 500 : 400, flex: 1, paddingRight: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {conv.lastMessage === '[Media]' ? <><ImageIcon size={12} /> Media</> : conv.lastMessage}
                                                </p>
                                                {(conv.unread || 0) > 0 && (
                                                    <span style={{ background: 'var(--color-accent)', color: 'white', borderRadius: '10px', padding: '2px 6px', fontSize: 10, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                                                        {conv.unread}
                                                    </span>
                                                )}
                                            </div>
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
                                                padding: (msg.media_url && (msg.message_type === 'image' || msg.message_type === 'video')) ? '4px 4px 4px 4px' : 'var(--space-2) var(--space-3)',
                                                borderRadius: msg.direction === 'outbound' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                                background: msg.direction === 'outbound'
                                                    ? (msg.is_from_bot ? 'rgba(108,99,255,0.85)' : 'var(--color-accent)')
                                                    : 'var(--color-bg-elevated)',
                                                color: msg.direction === 'outbound' ? 'white' : 'var(--color-text-primary)',
                                                fontSize: 'var(--text-sm)', lineHeight: 1.5,
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                                opacity: msg.id.startsWith('opt-') ? 0.7 : 1,
                                                overflow: 'hidden',
                                            }}>
                                                {/* Media content */}
                                                {msg.media_url && msg.message_type === 'image' && (
                                                    <div style={{ position: 'relative', cursor: 'pointer', marginBottom: msg.content ? 6 : 0 }}
                                                         onClick={() => setLightboxUrl(msg.media_url)}>
                                                        <img
                                                            src={msg.media_url}
                                                            alt="Media"
                                                            style={{
                                                                maxWidth: '100%',
                                                                maxHeight: 280,
                                                                borderRadius: 8,
                                                                display: 'block',
                                                                objectFit: 'cover',
                                                            }}
                                                            loading="lazy"
                                                        />
                                                        <div style={{
                                                            position: 'absolute', top: 6, right: 6,
                                                            background: 'rgba(0,0,0,0.5)', borderRadius: '50%',
                                                            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <ZoomIn size={14} color="white" />
                                                        </div>
                                                    </div>
                                                )}
                                                {msg.media_url && msg.message_type === 'video' && (
                                                    <video
                                                        src={msg.media_url}
                                                        controls
                                                        style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, display: 'block', marginBottom: msg.content ? 6 : 0 }}
                                                    />
                                                )}
                                                {msg.media_url && msg.message_type === 'audio' && (
                                                    <audio src={msg.media_url} controls style={{ maxWidth: '100%', marginBottom: msg.content ? 6 : 0 }} />
                                                )}
                                                {msg.media_url && msg.message_type === 'document' && (
                                                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
                                                       style={{
                                                           display: 'flex', alignItems: 'center', gap: 8,
                                                           padding: '8px 12px', borderRadius: 8,
                                                           background: msg.direction === 'outbound' ? 'rgba(255,255,255,0.15)' : 'var(--color-bg-secondary)',
                                                           marginBottom: msg.content ? 6 : 0,
                                                           textDecoration: 'none', color: 'inherit',
                                                       }}>
                                                        <FileText size={20} style={{ flexShrink: 0 }} />
                                                        <span style={{ fontSize: 'var(--text-xs)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dokumen</span>
                                                        <Download size={16} style={{ flexShrink: 0 }} />
                                                    </a>
                                                )}
                                                {/* Placeholder for media without URL */}
                                                {!msg.media_url && msg.message_type !== 'text' && (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        padding: '8px 12px', borderRadius: 8,
                                                        background: msg.direction === 'outbound' ? 'rgba(255,255,255,0.15)' : 'var(--color-bg-secondary)',
                                                        marginBottom: msg.content ? 6 : 0,
                                                        color: msg.direction === 'outbound' ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)',
                                                        fontSize: 'var(--text-xs)',
                                                    }}>
                                                        {msg.message_type === 'image' && <><ImageIcon size={16} /> Gambar</>}
                                                        {msg.message_type === 'video' && <><Film size={16} /> Video</>}
                                                        {msg.message_type === 'audio' && <><Music size={16} /> Audio</>}
                                                        {msg.message_type === 'document' && <><FileText size={16} /> Dokumen</>}
                                                        {!['image', 'video', 'audio', 'document'].includes(msg.message_type) && msg.message_type}
                                                    </div>
                                                )}
                                                {/* Text content / caption */}
                                                {msg.content && (
                                                    <div style={{ padding: (msg.media_url && (msg.message_type === 'image' || msg.message_type === 'video')) ? '0 8px 4px' : 0 }}>
                                                        {msg.content}
                                                    </div>
                                                )}
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
                    </div>

                    {/* Input */}
                        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
                            {/* Attachment preview */}
                            {attachment && (
                                <div style={{ padding: 'var(--space-3) var(--space-4) 0', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                                        background: 'var(--color-bg-elevated)', borderRadius: 12,
                                        padding: 'var(--space-2) var(--space-3)', flex: 1,
                                        border: '1px solid var(--color-border)',
                                    }}>
                                        {attachment.mediaType === 'image' && attachment.previewUrl ? (
                                            <img src={attachment.previewUrl} alt="Preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                                        ) : attachment.mediaType === 'video' ? (
                                            <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--color-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Film size={20} style={{ color: 'var(--color-accent)' }} />
                                            </div>
                                        ) : attachment.mediaType === 'audio' ? (
                                            <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--color-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Music size={20} style={{ color: 'var(--color-accent)' }} />
                                            </div>
                                        ) : (
                                            <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--color-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <FileText size={20} style={{ color: 'var(--color-accent)' }} />
                                            </div>
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {attachment.file.name}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                                                {(attachment.file.size / 1024).toFixed(0)} KB · {attachment.mediaType}
                                            </div>
                                        </div>
                                        <button className="btn btn-ghost btn-sm btn-icon" onClick={clearAttachment} title="Hapus attachment">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    style={{ display: 'none' }}
                                    accept="image/*,video/mp4,video/3gpp,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                                />
                                <button
                                    className="btn btn-ghost btn-icon"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Lampirkan file"
                                    style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }}
                                    disabled={sending}
                                >
                                    <Paperclip size={18} />
                                </button>
                                <textarea
                                    className="form-textarea"
                                    style={{ flex: 1, minHeight: 40, maxHeight: 120, resize: 'none', borderRadius: 20, padding: '8px var(--space-4)' }}
                                    placeholder={attachment ? 'Tambahkan caption... (opsional)' : 'Ketik pesan... (Enter untuk kirim)'}
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    rows={1}
                                />
                                <button
                                    className="btn btn-primary btn-icon"
                                    onClick={handleSend}
                                    disabled={sending || uploading || (!newMessage.trim() && !attachment)}
                                    style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }}
                                >
                                    {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                </button>
                            </div>
                        </div>
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 'var(--space-4)', color: 'var(--color-text-muted)' }}>
                    <MessageSquare size={48} style={{ opacity: 0.3 }} />
                    <p style={{ fontSize: 'var(--text-md)' }}>Pilih percakapan untuk mulai chat</p>
                </div>
            )}

            {/* Lightbox */}
            {lightboxUrl && (
                <div
                    onClick={() => setLightboxUrl(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'zoom-out',
                    }}
                >
                    <button
                        onClick={() => setLightboxUrl(null)}
                        style={{
                            position: 'absolute', top: 16, right: 16,
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            borderRadius: '50%', width: 40, height: 40,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'white',
                        }}
                    >
                        <X size={20} />
                    </button>
                    <img
                        src={lightboxUrl}
                        alt="Full size"
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '90vw', maxHeight: '90vh',
                            borderRadius: 12, objectFit: 'contain',
                            cursor: 'default',
                        }}
                    />
                </div>
            )}
        </div>
    );
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Plus,
    Search,
    Trash2,
    ChevronRight,
    Check,
    Home,
    ShoppingCart,
    Image as ImageIcon,
    ExternalLink,
    MoreVertical,
    X,
    GripVertical,
    Maximize2,
    Trophy,
    Hammer,
    Move
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInWithCustomToken,
    signInAnonymously,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    onSnapshot,
    query
} from 'firebase/firestore';

// --- Firebase Configuration ---
const getFirebaseConfig = () => {
    // 1. Try environment variables (Vite standard)
    if (import.meta.env.VITE_FIREBASE_API_KEY) {
        return {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID
        };
    }
    // 2. Fallback to window object (legacy/injection)
    if (window.__firebase_config) {
        return typeof window.__firebase_config === 'string'
            ? JSON.parse(window.__firebase_config)
            : window.__firebase_config;
    }
    return null;
};

const firebaseConfig = getFirebaseConfig();
let app = null;
let auth = null;
let db = null;

if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'placeholder') {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) {
        console.error("Firebase Initialization Error:", e);
    }
}

const appId = import.meta.env.VITE_APP_ID || (typeof window.__app_id !== 'undefined' ? window.__app_id : 'myhome-mind-v1');

// --- Scandinavian Palette & Constants ---
const COLORS = {
    bg: '#FBFBF9',
    card: '#FFFFFF',
    text: '#2D2D2D',
    secondary: '#717171',
    accent: '#E5DED4',
    border: '#ECECEC',
    success: '#9CAF88'
};

const DEFAULT_SPACES = [
    { id: '1', name: 'Living Room', image: null },
    { id: '2', name: 'Kitchen', image: null },
    { id: '3', name: 'Bathroom', image: null },
    { id: '4', name: 'Master Bedroom', image: null },
    { id: '5', name: 'Wardrobe', image: null },
    { id: '6', name: 'Kids\' Room', image: null },
    { id: '7', name: 'Garden', image: null },
];

export default function App() {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('assets');
    const [searchQuery, setSearchQuery] = useState('');
    const [spaces, setSpaces] = useState(DEFAULT_SPACES);
    const [items, setItems] = useState([]);
    const [groceries, setGroceries] = useState([]);
    const [repairs, setRepairs] = useState([]);
    const [selectedSpace, setSelectedSpace] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(null);
    const [toast, setToast] = useState(null);

    // --- Auth Setup ---
    useEffect(() => {
        const initAuth = async () => {
            // Wait for auth state to settle before deciding to sign in anonymously
        };
        initAuth();

        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) {
                setUser(u);
            } else {
                // Only sign in anonymously if no user is signed in and we aren't in a loading state
                // But actually, for Google Auth flow, we want to allow staying signed out or sign in anonymously as fallback?
                // For this app, let's keep the anonymous fallback for new users, but allow Google Sign In to override.
                // However, onAuthStateChanged fires with null on logout. We don't want to immediately sign in anonymously again if they just logged out?
                // Let's safe-guard: if no user, try anonymous.
                try {
                    await signInAnonymously(auth);
                } catch (e) {
                    console.error("Anon auth failed", e);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    const handleGoogleLogin = async () => {
        if (!auth) return;
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            if (error.code === 'auth/unauthorized-domain') {
                showToast(`Domain not authorized. Add to Firebase Auth settings.`);
            } else if (error.code === 'auth/popup-closed-by-user') {
                // User closed popup, no error needed
            } else {
                showToast(`Login failed: ${error.message}`);
            }
        }
    };

    const handleLogout = async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            // After sign out, the onAuthStateChanged will likely trigger anonymous login again, which is fine for this app's design (always usable).
            showToast('Signed out');
        } catch (error) {
            console.error("Logout Error:", error);
        }
    };

    // --- Check for Share Link ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const shareId = params.get('share');
        if (shareId) setIsReadOnly(true);
    }, []);

    // --- Data Sync ---
    useEffect(() => {
        if (!user) return;

        const params = new URLSearchParams(window.location.search);
        const shareId = params.get('share');

        // Path segment rule check: artifacts/{appId}/users/{userId}/{collection}/{doc}
        const docPath = shareId
            ? doc(db, 'artifacts', appId, 'public', 'data', 'shares', shareId)
            : doc(db, 'artifacts', appId, 'users', user.uid, 'personal', 'settings');

        const unsubscribe = onSnapshot(docPath, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.spaces) setSpaces(data.spaces);
                if (data.items) setItems(data.items);
                if (data.groceries) setGroceries(data.groceries);
                if (data.repairs) setRepairs(data.repairs);
            }
            setLoading(false);
        }, (err) => {
            console.error("Firestore read error:", err);
            // If it's a permission error, it might be due to security rules or auth
            if (err.code === 'permission-denied') {
                setAuthError("Database permission denied. Checking security rules...");
            } else {
                setAuthError(err.message);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const saveData = async (newSpaces, newItems, newGroceries, newRepairs) => {
        if (!user || isReadOnly) return;

        try {
            const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'personal', 'settings');

            const updates = { lastUpdated: Date.now() };
            if (newSpaces !== undefined && newSpaces !== null) updates.spaces = newSpaces;
            if (newItems !== undefined && newItems !== null) updates.items = newItems;
            if (newGroceries !== undefined && newGroceries !== null) updates.groceries = newGroceries;
            if (newRepairs !== undefined && newRepairs !== null) updates.repairs = newRepairs;

            await setDoc(docRef, updates, { merge: true });
        } catch (err) {
            console.error("Firestore write error:", err);
        }
    };

    // --- Actions ---
    const addGrocery = () => {
        const newItem = { id: crypto.randomUUID(), text: '', completed: false };
        const updated = [newItem, ...groceries];
        setGroceries(updated);
        saveData(null, null, updated, null);
    };

    const updateGrocery = (id, field, value) => {
        const updated = groceries.map(g => g.id === id ? { ...g, [field]: value } : g);
        setGroceries(updated);
        saveData(null, null, updated, null);
    };

    const deleteGrocery = (id) => {
        const updated = groceries.filter(g => g.id !== id);
        setGroceries(updated);
        saveData(null, null, updated, null);
    };

    // --- Repairs Actions ---
    const addRepair = () => {
        const newItem = { id: crypto.randomUUID(), text: '', completed: false };
        const updated = [newItem, ...repairs];
        setRepairs(updated);
        saveData(null, null, null, updated);
    };

    const updateRepair = (id, field, value) => {
        const updated = repairs.map(r => r.id === id ? { ...r, [field]: value } : r);
        setRepairs(updated);
        saveData(null, null, null, updated);
    };

    const deleteRepair = (id) => {
        const updated = repairs.filter(r => r.id !== id);
        setRepairs(updated);
        saveData(null, null, null, updated);
    };

    // --- DnD Migration & Stability ---
    useEffect(() => {
        if (selectedItem && selectedItem.options && selectedItem.options.some(o => !o.id)) {
            const patchedOptions = selectedItem.options.map(o => o.id ? o : { ...o, id: crypto.randomUUID() });
            updateItem(selectedItem.id, { options: patchedOptions });
        }
    }, [selectedItem]);

    // --- Option Reordering ---
    const [draggedOptionIdx, setDraggedOptionIdx] = useState(null);

    const handleOptionDragStart = (e, index) => {
        setDraggedOptionIdx(index);
        e.dataTransfer.effectAllowed = "move";
        // e.dataTransfer.setDragImage(e.target, 20, 20); // Optional: Custom drag image
    };

    const handleOptionDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleOptionDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedOptionIdx === null || draggedOptionIdx === dropIndex) return;

        const newOptions = [...selectedItem.options];
        const [draggedOption] = newOptions.splice(draggedOptionIdx, 1);
        newOptions.splice(dropIndex, 0, draggedOption);

        updateItem(selectedItem.id, { options: newOptions });
        setDraggedOptionIdx(null);
    };

    const handleSpaceImageUpload = (spaceId, file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const newSpaces = spaces.map(s => s.id === spaceId ? { ...s, image: reader.result } : s);
            setSpaces(newSpaces);
            saveData(newSpaces, undefined, undefined, undefined);
        };
        if (file) reader.readAsDataURL(file);
    };

    const handleItemImageUpload = (itemId, file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const newItems = items.map(i => i.id === itemId ? { ...i, image: reader.result } : i);
            setItems(newItems);
            if (selectedItem && selectedItem.id === itemId) {
                setSelectedItem({ ...selectedItem, image: reader.result });
            }
            saveData(undefined, newItems, undefined);
        };
        if (file) reader.readAsDataURL(file);
    };

    const addItemToSpace = (spaceId) => {
        const newItem = {
            id: crypto.randomUUID(),
            spaceId,
            name: 'New Item',
            options: [],
            order: items.length
        };
        const updated = [...items, newItem];
        setItems(updated);
        saveData(null, updated, null);
    };

    const updateItem = (itemId, updates) => {
        const updated = items.map(i => i.id === itemId ? { ...i, ...updates } : i);
        setItems(updated);
        saveData(null, updated, null);
        if (selectedItem?.id === itemId) setSelectedItem({ ...selectedItem, ...updates });
    };

    const deleteItem = (itemId) => {
        const updated = items.filter(i => i.id !== itemId);
        setItems(updated);
        saveData(null, updated, null);
        setSelectedItem(null);
    };

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };



    const handleOptionImageUpload = (itemId, optionIndex, file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const item = items.find(i => i.id === itemId);
            if (!item) return;
            const newOptions = [...(item.options || [])];
            if (newOptions[optionIndex]) {
                newOptions[optionIndex] = { ...newOptions[optionIndex], image: reader.result };
                updateItem(itemId, { options: newOptions });
            }
        };
        if (file) reader.readAsDataURL(file);
    };

    // --- Filtering ---
    const getSearchMatches = (item, query) => {
        if (!query) return [];
        const q = query.toLowerCase();
        const matches = [];

        // Checklist: Item Name
        if ((item.name || '').toLowerCase().includes(q)) {
            matches.push({ id: `item-${item.id}`, text: item.name, type: 'ITEM' });
        }

        // Checklist: Options
        (item.options || []).forEach((opt, idx) => {
            const modelMatch = (opt.model || '').toLowerCase().includes(q);
            const storeMatch = (opt.store || '').toLowerCase().includes(q);

            if (modelMatch) {
                matches.push({ id: `opt-${item.id}-${idx}`, text: `${item.name}: ${opt.model}`, type: 'OPTION' });
            } else if (storeMatch) {
                matches.push({ id: `store-${item.id}-${idx}`, text: `${item.name}: ${opt.store} (Store)`, type: 'STORE' });
            }
        });

        return matches;
    };

    const matchItem = (item, query) => {
        const q = query.toLowerCase();
        const atomicName = (item.name || '').toLowerCase();
        const matchesName = atomicName.includes(q);
        const matchesOptions = (item.options || []).some(opt =>
            (opt.model || '').toLowerCase().includes(q) ||
            (opt.store || '').toLowerCase().includes(q)
        );
        return matchesName || matchesOptions;
    };

    const filteredSpaces = spaces.filter(s => {
        const matchesName = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const hasMatchingItems = items.some(i => i.spaceId === s.id && matchItem(i, searchQuery));
        return matchesName || hasMatchingItems;
    });
    const filteredGroceries = groceries.filter(g => (g.text || '').toLowerCase().includes(searchQuery.toLowerCase()));

    if (!app || !auth) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#FBFBF9] p-8 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
                <h1 className="text-2xl font-medium tracking-tight mb-4">Configuration Required</h1>
                <p className="text-[#717171] max-w-md mb-8">
                    MyHome Mind requires a valid Firebase configuration to run.
                    Please set up your environment variables or check your deployment settings.
                </p>
                <div className="bg-white p-6 rounded-xl border border-[#ECECEC] text-left max-w-lg w-full shadow-sm">
                    <h3 className="text-sm font-medium mb-3">Required Environment Variables:</h3>
                    <code className="block text-xs text-[#717171] bg-[#F5F5F5] p-4 rounded-lg overflow-x-auto">
                        VITE_FIREBASE_API_KEY=...<br />
                        VITE_FIREBASE_AUTH_DOMAIN=...<br />
                        VITE_FIREBASE_PROJECT_ID=...
                    </code>
                </div>
            </div>
        );
    }

    if (authError) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#FBFBF9] p-8 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
                <h1 className="text-xl font-medium tracking-tight mb-2 text-red-600">Connection Error</h1>
                <p className="text-[#717171] max-w-md mb-6">{authError}</p>
                <div className="bg-white p-4 rounded-xl border border-[#ECECEC] text-sm text-left max-w-md">
                    <p className="font-medium mb-2">Troubleshooting:</p>
                    <ul className="list-disc pl-5 space-y-1 text-[#717171]">
                        <li>Enable <strong>Anonymous Authentication</strong> in Firebase Console &gt; Authentication &gt; Sign-in method.</li>
                        <li>Create a <strong>Firestore Database</strong> in test mode (or production mode) in Firebase Console.</li>
                        <li>Check your internet connection.</li>
                    </ul>
                </div>
                <button onClick={() => window.location.reload()} className="mt-8 px-6 py-2 bg-[#2D2D2D] text-white rounded-full text-sm">
                    Retry
                </button>
            </div>
        );
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-[#FBFBF9]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            <div className="animate-pulse text-[#717171] font-light tracking-widest uppercase">MyHome Mind</div>
        </div>
    );

    return (
        <div className="flex flex-col h-[100dvh] bg-[#FBFBF9] text-[#2D2D2D] selection:bg-[#E5DED4] overflow-hidden relative" style={{ fontFamily: 'Outfit, sans-serif' }}>

            {/* Toast Notification - Absolute to App Shell */}
            {toast && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#2D2D2D] text-white px-6 py-3 rounded-full text-sm shadow-xl z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none">
                    {toast}
                </div>
            )}

            {/* Header */}
            <header className="shrink-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#ECECEC] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-medium tracking-tight">MyHome Mind</h1>
                    {isReadOnly && <span className="text-[10px] bg-[#E5DED4] px-2 py-0.5 rounded-full uppercase tracking-tighter">Shared View</span>}
                </div>

                <div className="flex items-center gap-3 flex-1 max-w-2xl justify-end">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#717171]" />
                        <input
                            type="text"
                            placeholder="Search items..."
                            className="w-full bg-[#F5F5F5] border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-[#D2B48C] transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* User Profile / Auth */}
                    {user && (
                        <div className="flex items-center gap-2 ml-2">
                            {user.photoURL ? (
                                <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-[#ECECEC]" title={user.displayName || user.email} />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[#717171] font-bold text-xs" title="Anonymous User">
                                    {user.isAnonymous ? 'A' : (user.email ? user.email[0].toUpperCase() : 'U')}
                                </div>
                            )}

                            {user.isAnonymous ? (
                                <button
                                    onClick={handleGoogleLogin}
                                    className="text-xs bg-[#2D2D2D] text-white px-3 py-1.5 rounded-full hover:bg-black transition-colors whitespace-nowrap"
                                >
                                    Sign In to Sync
                                </button>
                            ) : (
                                <button
                                    onClick={handleLogout}
                                    className="text-xs text-[#717171] hover:text-[#2D2D2D] px-2 py-1 transition-colors whitespace-nowrap"
                                >
                                    Sign Out
                                </button>
                            )}
                        </div>
                    )}

                </div>
            </header>



            {/* Main Content Area - Scrollable */}
            <main className="flex-1 overflow-y-auto p-6 md:p-10 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
                {activeTab === 'groceries' ? (
                    <div className="max-w-xl mx-auto space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-light">Shopping Checklist</h2>
                            {!isReadOnly && (
                                <button
                                    onClick={addGrocery}
                                    className="bg-[#2D2D2D] text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 hover:bg-black transition-colors"
                                >
                                    <Plus className="w-4 h-4" /> Add Item
                                </button>
                            )}
                        </div>
                        <div className="bg-white rounded-3xl border border-[#ECECEC] overflow-hidden shadow-sm">
                            {filteredGroceries.length === 0 ? (
                                <div className="p-12 text-center text-[#717171] font-light">
                                    No grocery items found. Start by adding one.
                                </div>
                            ) : (
                                <ul className="divide-y divide-[#F5F5F5]">
                                    {filteredGroceries.map((item) => (
                                        <li key={item.id} className="group flex items-center gap-4 px-6 py-4 hover:bg-[#FAFAFA] transition-colors">
                                            <button
                                                disabled={isReadOnly}
                                                onClick={() => updateGrocery(item.id, 'completed', !item.completed)}
                                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${item.completed ? 'bg-[#9CAF88] border-[#9CAF88]' : 'border-[#ECECEC]'}`}
                                            >
                                                {item.completed && <Check className="w-3 h-3 text-white" />}
                                            </button>
                                            <input
                                                readOnly={isReadOnly}
                                                className={`flex-1 bg-transparent border-none focus:ring-0 text-sm py-0 ${item.completed ? 'text-[#717171] line-through' : ''}`}
                                                value={item.text}
                                                placeholder="Item name..."
                                                onChange={(e) => updateGrocery(item.id, 'text', e.target.value)}
                                            />
                                            {!isReadOnly && (
                                                <button
                                                    onClick={() => deleteGrocery(item.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-2 text-[#717171] hover:text-red-500 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                ) : activeTab === 'repairs' ? (
                    <div className="max-w-xl mx-auto space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-light">Home Repairs</h2>
                            {!isReadOnly && (
                                <button
                                    onClick={addRepair}
                                    className="bg-[#2D2D2D] text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 hover:bg-black transition-colors"
                                >
                                    <Plus className="w-4 h-4" /> Add Task
                                </button>
                            )}
                        </div>
                        <div className="bg-white rounded-3xl border border-[#ECECEC] overflow-hidden shadow-sm">
                            {(repairs || []).length === 0 ? (
                                <div className="p-12 text-center text-[#717171] font-light">
                                    No repairs needed.
                                </div>
                            ) : (
                                <ul className="divide-y divide-[#F5F5F5]">
                                    {(repairs || []).map((item) => (
                                        <li key={item.id} className="group flex items-center gap-4 px-6 py-4 hover:bg-[#FAFAFA] transition-colors">
                                            <button
                                                disabled={isReadOnly}
                                                onClick={() => updateRepair(item.id, 'completed', !item.completed)}
                                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${item.completed ? 'bg-[#9CAF88] border-[#9CAF88]' : 'border-[#ECECEC]'}`}
                                            >
                                                {item.completed && <Check className="w-3 h-3 text-white" />}
                                            </button>
                                            <input
                                                readOnly={isReadOnly}
                                                className={`flex-1 bg-transparent border-none focus:ring-0 text-sm py-0 ${item.completed ? 'text-[#717171] line-through' : ''}`}
                                                value={item.text}
                                                placeholder="Repair task..."
                                                onChange={(e) => updateRepair(item.id, 'text', e.target.value)}
                                            />
                                            {!isReadOnly && (
                                                <button
                                                    onClick={() => deleteRepair(item.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-2 text-[#717171] hover:text-red-500 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                ) : searchQuery ? (
                    // --- Global Search Results View ---
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-xl font-light mb-6">Search Results</h2>
                            {items.filter(i => matchItem(i, searchQuery)).length === 0 ? (
                                <div className="text-center py-20 text-[#717171]">
                                    <p className="text-lg font-light mb-2">No items found</p>
                                    <p className="text-sm">Try searching for a different item name, brand, or store.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {items
                                        .filter(i => matchItem(i, searchQuery))
                                        .map(item => {
                                            const parentSpace = spaces.find(s => s.id === item.spaceId);
                                            const matches = getSearchMatches(item, searchQuery);
                                            return (
                                                <div
                                                    key={item.id}
                                                    onClick={() => setSelectedItem(item)}
                                                    className="bg-white p-5 rounded-2xl border border-[#ECECEC] hover:shadow-md transition-all cursor-pointer relative flex flex-col h-fit group"
                                                >
                                                    {/* Space Badge */}
                                                    <div className="absolute top-4 right-4 z-10">
                                                        <span className="text-[10px] uppercase font-bold tracking-wider bg-[#F5F5F5] text-[#717171] px-2 py-1 rounded-md">
                                                            {parentSpace?.name || 'Unknown Space'}
                                                        </span>
                                                    </div>

                                                    <div className="flex justify-between items-start mb-4 pr-16">
                                                        <h4 className="font-medium text-lg">{item.name}</h4>
                                                    </div>

                                                    {/* Matched Highlights */}
                                                    <div className="mb-4 flex flex-wrap gap-1">
                                                        {matches.slice(0, 3).map(m => (
                                                            <span key={m.id} className="text-[10px] bg-[#E5DED4]/30 text-[#2D2D2D] px-1.5 py-0.5 rounded border border-[#E5DED4]">
                                                                {m.text}
                                                            </span>
                                                        ))}
                                                    </div>

                                                    {item.options && item.options.length > 0 ? (
                                                        <div className="space-y-3">
                                                            {(item.options || []).slice(0, 3).map((opt, idx) => (
                                                                <div key={idx} className={`p-3 rounded-xl border text-xs overflow-hidden ${opt.winner ? 'bg-[#9CAF88]/5 border-[#9CAF88]/20' : 'bg-[#F9F9F9] border-transparent'}`}>
                                                                    {opt.image && (
                                                                        <div className="w-full h-24 mb-3 rounded-lg overflow-hidden relative">
                                                                            <img src={opt.image} alt={opt.model} className="w-full h-full object-cover" />
                                                                            {opt.winner && <div className="absolute top-2 right-2 bg-[#9CAF88] text-white p-1 rounded-full"><Trophy className="w-3 h-3" /></div>}
                                                                        </div>
                                                                    )}
                                                                    <div className="flex justify-between font-medium mb-1">
                                                                        <span>{opt.model || 'Untitled'}</span>
                                                                        <span>{opt.price ? `€${opt.price}` : '—'}</span>
                                                                    </div>
                                                                    <div className="text-[#717171] truncate">{opt.store || ''}</div>
                                                                </div>
                                                            ))}
                                                            {item.options.length > 3 && <div className="text-[10px] text-center text-[#717171]">+ {item.options.length - 3} more options</div>}
                                                        </div>
                                                    ) : (
                                                        <div className="py-8 flex flex-col items-center justify-center text-[#BCBCBC] border-2 border-dashed border-[#F5F5F5] rounded-xl">
                                                            <Plus className="w-6 h-6 mb-2 opacity-50" />
                                                            <span className="text-[11px] uppercase tracking-widest">No Options</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // --- Default Space Grid View ---
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredSpaces.map((space) => (
                            <div
                                key={space.id}
                                className="group relative bg-white rounded-3xl border border-[#ECECEC] overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                                onClick={() => setSelectedSpace(space)}
                            >
                                <div className="aspect-[4/3] bg-[#F5F5F5] relative overflow-hidden">
                                    {space.image ? (
                                        <img src={space.image} alt={space.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[#BCBCBC]">
                                            <ImageIcon className="w-8 h-8 opacity-20" />
                                        </div>
                                    )}
                                    {!isReadOnly && (
                                        <label
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute bottom-4 right-4 p-2.5 bg-white/90 backdrop-blur rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:scale-105"
                                        >
                                            <Plus className="w-4 h-4" />
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleSpaceImageUpload(space.id, e.target.files[0])} />
                                        </label>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                                </div>
                                <div className="p-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-lg tracking-tight">{space.name}</h3>
                                        <div className="flex items-center gap-1 text-[11px] text-[#717171] font-medium bg-[#F5F5F5] px-2 py-0.5 rounded-full">
                                            {items.filter(i => i.spaceId === space.id).length} ITEMS
                                        </div>
                                    </div>
                                    {searchQuery && (
                                        <div className="mt-4 pt-4 border-t border-[#F5F5F5]">
                                            <p className="text-[10px] uppercase tracking-widest text-[#717171] mb-2">Matches found:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {items
                                                    .filter(i => i.spaceId === space.id)
                                                    .flatMap(i => getSearchMatches(i, searchQuery))
                                                    .slice(0, 3)
                                                    .map(match => (
                                                        <span key={match.id} className="text-xs bg-[#F5F5F5] px-2 py-1 rounded-md text-[#2D2D2D]">
                                                            {match.text}
                                                        </span>
                                                    ))
                                                }
                                                {items.filter(i => i.spaceId === space.id).flatMap(i => getSearchMatches(i, searchQuery)).length > 3 && (
                                                    <span className="text-xs text-[#717171] self-center">
                                                        +{items.filter(i => i.spaceId === space.id).flatMap(i => getSearchMatches(i, searchQuery)).length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Main Navigation - Fixed at bottom of flex column */}
            <nav className="shrink-0 w-full md:w-auto bg-white md:bg-transparent border-t md:border-none border-[#ECECEC] flex md:justify-center p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:pb-2 z-40 relative">
                <div className="flex w-full md:w-auto md:bg-white md:p-1.5 md:rounded-full md:shadow-sm md:border md:border-[#ECECEC] gap-2">
                    <button
                        onClick={() => setActiveTab('groceries')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-full transition-all ${activeTab === 'groceries' ? 'bg-[#2D2D2D] text-white' : 'text-[#717171] hover:bg-[#F5F5F5]'}`}
                    >
                        <ShoppingCart className="w-4 h-4" />
                        <span className="text-sm font-medium hidden md:inline">Daily Groceries</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('assets')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-full transition-all ${activeTab === 'assets' ? 'bg-[#2D2D2D] text-white' : 'text-[#717171] hover:bg-[#F5F5F5]'}`}
                    >
                        <Home className="w-4 h-4" />
                        <span className="text-sm font-medium hidden md:inline">Home Assets</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('repairs')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-full transition-all ${activeTab === 'repairs' ? 'bg-[#2D2D2D] text-white' : 'text-[#717171] hover:bg-[#F5F5F5]'}`}
                    >
                        <Hammer className="w-4 h-4" />
                        <span className="text-sm font-medium hidden md:inline">Repairs</span>
                    </button>
                </div>
            </nav>


            {/* Space Detail View */}
            {selectedSpace && (
                <div
                    className="fixed inset-0 z-50 bg-[#FBFBF9] flex flex-col animate-in slide-in-from-bottom duration-300"
                >
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="border-b border-[#ECECEC] p-6 flex items-center justify-between bg-white/50 backdrop-blur-md">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setSelectedSpace(null)}
                                    className="p-2 rounded-full hover:bg-[#F5F5F5]"
                                >
                                    <ChevronRight className="w-5 h-5 rotate-180" />
                                </button>
                                <h2 className="text-2xl font-light">{selectedSpace.name}</h2>
                            </div>
                            {!isReadOnly && (
                                <button
                                    onClick={() => addItemToSpace(selectedSpace.id)}
                                    className="bg-[#2D2D2D] text-white px-6 py-2 rounded-full text-sm flex items-center gap-2 shadow-sm"
                                >
                                    <Plus className="w-4 h-4" /> Add Item
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 md:p-10">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {items
                                    .filter(i => i.spaceId === selectedSpace.id)
                                    .filter(i => matchItem(i, searchQuery))
                                    .map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedItem(item)}
                                            className="bg-white p-5 rounded-2xl border border-[#ECECEC] hover:shadow-md transition-all cursor-pointer relative flex flex-col h-fit"
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <h4 className="font-medium">{item.name}</h4>
                                                {item.options?.some(o => o.winner) && <Trophy className="w-4 h-4 text-[#9CAF88]" />}
                                            </div>

                                            {item.options && item.options.length > 0 ? (
                                                <div className="space-y-3">
                                                    {(item.options || []).slice(0, 3).map((opt, idx) => (
                                                        <div key={idx} className={`p-3 rounded-xl border text-xs overflow-hidden ${opt.winner ? 'bg-[#9CAF88]/5 border-[#9CAF88]/20' : 'bg-[#F9F9F9] border-transparent'}`}>
                                                            {opt.image && (
                                                                <div className="w-full h-24 mb-3 rounded-lg overflow-hidden relative">
                                                                    <img src={opt.image} alt={opt.model} className="w-full h-full object-cover" />
                                                                    {opt.winner && <div className="absolute top-2 right-2 bg-[#9CAF88] text-white p-1 rounded-full"><Trophy className="w-3 h-3" /></div>}
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between font-medium mb-1">
                                                                <span>{opt.model || 'Untitled'}</span>
                                                                <span>{opt.price ? `€${opt.price}` : '—'}</span>
                                                            </div>
                                                            <div className="text-[#717171] truncate">{opt.store || ''}</div>
                                                        </div>
                                                    ))}
                                                    {item.options.length > 3 && <div className="text-[10px] text-center text-[#717171]">+ {item.options.length - 3} more options</div>}
                                                </div>
                                            ) : (
                                                <div className="py-8 flex flex-col items-center justify-center text-[#BCBCBC] border-2 border-dashed border-[#F5F5F5] rounded-xl">
                                                    <Plus className="w-6 h-6 mb-2 opacity-50" />
                                                    <span className="text-[11px] uppercase tracking-widest">Compare Options</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Item Comparison Modal */}
            {selectedItem && (
                <div
                    onClick={() => setSelectedItem(null)}
                    className="fixed inset-0 z-[60] bg-black/10 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                    >
                        <div className="p-8 border-b border-[#ECECEC] flex items-center justify-between">
                            <div className="flex-1 flex items-center gap-5">
                                <div className="relative group w-20 h-20 bg-[#F5F5F5] rounded-xl overflow-hidden shrink-0">
                                    {selectedItem.image ? (
                                        <img src={selectedItem.image} alt="Item" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[#BCBCBC]">
                                            <ImageIcon className="w-6 h-6 opacity-20" />
                                        </div>
                                    )}
                                    {!isReadOnly && (
                                        <label className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <Plus className="w-5 h-5 text-white drop-shadow-md" />
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleItemImageUpload(selectedItem.id, e.target.files[0])} />
                                        </label>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <input
                                        readOnly={isReadOnly}
                                        className="text-2xl font-light border-none focus:ring-0 p-0 w-full bg-transparent"
                                        value={selectedItem.name || ''}
                                        onChange={(e) => updateItem(selectedItem.id, { name: e.target.value })}
                                        placeholder="Item Name"
                                    />
                                    <p className="text-[11px] text-[#717171] uppercase tracking-widest mt-1">Comparison Engine</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {!isReadOnly && (
                                    <button
                                        onClick={() => deleteItem(selectedItem.id)}
                                        className="p-2 text-[#717171] hover:text-red-500 rounded-full hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                                <button onClick={() => setSelectedItem(null)} className="p-2 hover:bg-[#F5F5F5] rounded-full transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 bg-[#FBFBF9]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                                {(selectedItem.options || []).map((option, idx) => (
                                    <div
                                        key={option.id || idx}
                                        draggable={!isReadOnly}
                                        onDragStart={(e) => handleOptionDragStart(e, idx)}
                                        onDragOver={(e) => handleOptionDragOver(e, idx)}
                                        onDrop={(e) => handleOptionDrop(e, idx)}
                                        className={`relative rounded-2xl border transition-all overflow-hidden ${option.winner ? 'bg-white border-[#9CAF88] shadow-sm' : 'bg-[#FAFAFA] border-[#ECECEC]'} ${draggedOptionIdx === idx ? 'opacity-50 scale-95' : ''} group/card`}
                                    >
                                        {!isReadOnly && (
                                            <div className="absolute top-2 left-2 z-20 cursor-move text-white/50 hover:text-white p-1 bg-black/10 rounded backdrop-blur-sm opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                <Move className="w-4 h-4" />
                                            </div>
                                        )}

                                        {/* Option Image Header - Full Bleed */}
                                        <div className="relative h-48 bg-[#F0F0F0] overflow-hidden group">
                                            {option.image ? (
                                                <img src={option.image} alt={option.model} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[#BCBCBC]">
                                                    <ImageIcon className="w-8 h-8 opacity-20" />
                                                </div>
                                            )}

                                            {!isReadOnly && (
                                                <label className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                                    <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 shadow-sm text-sm font-medium text-[#2D2D2D]">
                                                        <Plus className="w-4 h-4" /> Add Image
                                                    </div>
                                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleOptionImageUpload(selectedItem.id, idx, e.target.files[0])} />
                                                </label>
                                            )}

                                            {/* Action Buttons Overlay */}
                                            {!isReadOnly && (
                                                <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newOptions = [...selectedItem.options];
                                                            newOptions[idx].winner = !newOptions[idx].winner;
                                                            if (newOptions[idx].winner) {
                                                                newOptions.forEach((o, i) => { if (i !== idx) o.winner = false; });
                                                            }
                                                            updateItem(selectedItem.id, { options: newOptions });
                                                        }}
                                                        className={`p-2 rounded-full transition-colors shadow-sm ${option.winner ? 'bg-[#9CAF88] text-white border-none' : 'bg-white/90 backdrop-blur text-[#717171] hover:text-[#9CAF88]'}`}
                                                        title="Mark as Winner"
                                                    >
                                                        <Trophy className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newOptions = selectedItem.options.filter((_, i) => i !== idx);
                                                            updateItem(selectedItem.id, { options: newOptions });
                                                        }}
                                                        className="p-2 bg-white/90 backdrop-blur text-[#717171] hover:text-red-500 rounded-full shadow-sm"
                                                        title="Delete Option"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Gradient Overlay for Text Readability if needed, though text is below */}

                                            <div className="absolute inset-0 pointer-events-none border-b border-black/5" />
                                        </div>

                                        <div className="p-6 space-y-4">
                                            <div>
                                                <label className="text-[10px] text-[#717171] uppercase font-bold tracking-tighter">Model / Brand</label>
                                                <input
                                                    readOnly={isReadOnly}
                                                    className="w-full bg-transparent border-none p-0 text-lg font-medium focus:ring-0"
                                                    placeholder="e.g. Ikea Stockholm"
                                                    value={option.model || ''}
                                                    onChange={(e) => {
                                                        const newOptions = [...selectedItem.options];
                                                        newOptions[idx].model = e.target.value;
                                                        updateItem(selectedItem.id, { options: newOptions });
                                                    }}
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] text-[#717171] uppercase font-bold tracking-tighter">Price</label>
                                                    <div className="flex items-center border-b border-[#ECECEC]">
                                                        <span className="text-xs text-[#717171] mr-1">€</span>
                                                        <input
                                                            readOnly={isReadOnly}
                                                            type="number"
                                                            className="w-full bg-transparent border-none p-1 text-sm focus:ring-0"
                                                            value={option.price || ''}
                                                            onChange={(e) => {
                                                                const newOptions = [...selectedItem.options];
                                                                newOptions[idx].price = e.target.value;
                                                                updateItem(selectedItem.id, { options: newOptions });
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-[#717171] uppercase font-bold tracking-tighter">Store</label>
                                                    <input
                                                        readOnly={isReadOnly}
                                                        className="w-full bg-transparent border-b border-[#ECECEC] p-1 text-sm focus:ring-0"
                                                        placeholder="Store name"
                                                        value={option.store || ''}
                                                        onChange={(e) => {
                                                            const newOptions = [...selectedItem.options];
                                                            newOptions[idx].store = e.target.value;
                                                            updateItem(selectedItem.id, { options: newOptions });
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] text-[#717171] uppercase font-bold tracking-tighter">Link</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        readOnly={isReadOnly}
                                                        className="flex-1 bg-transparent border-b border-[#ECECEC] p-1 text-xs focus:ring-0 text-[#717171]"
                                                        placeholder="Paste product URL"
                                                        value={option.link || ''}
                                                        onChange={(e) => {
                                                            const newOptions = [...selectedItem.options];
                                                            newOptions[idx].link = e.target.value;
                                                            updateItem(selectedItem.id, { options: newOptions });
                                                        }}
                                                    />
                                                    {option.link && (
                                                        <a href={option.link} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-[#ECECEC] rounded transition-colors">
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] text-[#717171] uppercase font-bold tracking-tighter">Notes & Dimensions</label>
                                                <textarea
                                                    readOnly={isReadOnly}
                                                    className="w-full bg-transparent border border-[#ECECEC] rounded-xl p-3 text-xs focus:ring-0 resize-none h-20 mt-1"
                                                    placeholder="Dimensions, delivery time, material..."
                                                    value={option.notes || ''}
                                                    onChange={(e) => {
                                                        const newOptions = [...selectedItem.options];
                                                        newOptions[idx].notes = e.target.value;
                                                        updateItem(selectedItem.id, { options: newOptions });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {!isReadOnly && (
                                    <button
                                        onClick={() => {
                                            const newOption = { id: crypto.randomUUID(), model: '', price: '', store: '', link: '', notes: '', winner: false, image: null };
                                            updateItem(selectedItem.id, { options: [...(selectedItem.options || []), newOption] });
                                        }}
                                        className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-[#ECECEC] rounded-2xl hover:border-[#D2B48C] hover:bg-white transition-all text-[#717171] h-full min-h-[400px]"
                                    >
                                        <Plus className="w-8 h-8 mb-2 opacity-50" />
                                        <span className="text-xs font-medium uppercase tracking-widest">Add Option</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="h-20" />
        </div>
    );
}

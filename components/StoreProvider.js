'use client';
// Cart + wishlist, kept in the browser (localStorage), shared through context.
// Prices stored here are only for display; checkout re-prices on the server.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const CART_KEY = 'yp_cart_v1';
const WISH_KEY = 'yp_wishlist_v1';
const MAX_QTY = 20;

const StoreContext = createContext(null);

function load(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked (private mode): the cart still works for this visit
  }
}

export const lineKey = (l) => `${l.productId}:${l.variantId || ''}`;

export default function StoreProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [ready, setReady] = useState(false);
  const cartDialog = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    setCart(load(CART_KEY));
    setWishlist(load(WISH_KEY));
    setReady(true);
    const onStorage = (e) => {
      if (e.key === CART_KEY) setCart(load(CART_KEY));
      if (e.key === WISH_KEY) setWishlist(load(WISH_KEY));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => { if (ready) save(CART_KEY, cart); }, [cart, ready]);
  useEffect(() => { if (ready) save(WISH_KEY, wishlist); }, [wishlist, ready]);

  const openCart = useCallback(() => {
    lastFocus.current = document.activeElement;
    cartDialog.current?.showModal();
  }, []);
  const closeCart = useCallback(() => {
    cartDialog.current?.close();
    lastFocus.current?.focus?.();
  }, []);

  const addToCart = useCallback((item, qty = 1) => {
    setCart((current) => {
      const key = lineKey(item);
      const existing = current.find((l) => lineKey(l) === key);
      if (existing) {
        return current.map((l) => (lineKey(l) === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l));
      }
      return [...current, { ...item, qty: Math.min(MAX_QTY, qty) }];
    });
  }, []);

  const setQty = useCallback((key, qty) => {
    setCart((current) => (qty <= 0
      ? current.filter((l) => lineKey(l) !== key)
      : current.map((l) => (lineKey(l) === key ? { ...l, qty: Math.min(MAX_QTY, qty) } : l))));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // Returns true when the product was added (state updaters run later, so
  // decide from the current list rather than inside the updater).
  const toggleWishlist = useCallback((product) => {
    const added = !wishlist.some((p) => p.id === product.id);
    setWishlist((current) => (added
      ? [{ ...product, addedAt: Date.now() }, ...current.filter((p) => p.id !== product.id)].slice(0, 100)
      : current.filter((p) => p.id !== product.id)));
    return added;
  }, [wishlist]);

  const value = useMemo(() => ({
    ready, cart, wishlist, cartDialog,
    cartCount: cart.reduce((n, l) => n + l.qty, 0),
    cartSubtotal: cart.reduce((n, l) => n + l.qty * (l.price || 0), 0),
    addToCart, setQty, clearCart, openCart, closeCart, toggleWishlist,
    isWishlisted: (id) => wishlist.some((p) => p.id === id),
  }), [ready, cart, wishlist, addToCart, setQty, clearCart, openCart, closeCart, toggleWishlist]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { flyToCart } from "../lib/motion.js";
import { Icon } from "../components/ui.jsx";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/** Session user, server-side cart and toasts in one provider: they change together (login merges the cart). */
export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  const [cart, setCart] = useState({ items: [], count: 0, subtotal: 0 });
  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const tid = useRef(0);

  /** Show a toast. action: optional { label, onClick } button inside it. */
  const toast = useCallback((message, kind = "info", action = null) => {
    const id = ++tid.current;
    setToasts((t) => [...t.slice(-2), { id, message, kind, action }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 3200);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3450);
  }, []);

  const refreshCart = useCallback(() => api.get("/cart").then(setCart).catch(() => {}), []);

  useEffect(() => {
    api.get("/auth/me").then((d) => setUser(d.user)).catch(() => setUser(null));
    refreshCart();
  }, [refreshCart]);

  /** from: the product picture element; when given, it flies into the cart icon instead of opening the drawer. */
  const addToCart = useCallback(async (product, quantity = 1, { open, from, intervalDays } = {}) => {
    try {
      setCart(await api.post("/cart/items", { productId: product.id, quantity, ...(intervalDays !== undefined ? { intervalDays } : {}) }));
      if (from !== undefined) flyToCart(from);
      toast(`เพิ่ม ${product.name} ลงตะกร้าแล้ว`, "ok", { label: "ดูตะกร้า", onClick: () => setCartOpen(true) });
      if (open ?? from === undefined) setCartOpen(true);
      return true;
    } catch (e) {
      toast(e.message, "error");
      return false;
    }
  }, [toast]);

  /** Change quantity, and optionally the delivery mode (0 = once, 30/60/90 = subscribe). */
  const setQty = useCallback(async (productId, quantity, intervalDays) => {
    try {
      setCart(await api.put(`/cart/items/${productId}`, { quantity, ...(intervalDays !== undefined ? { intervalDays } : {}) }));
    } catch (e) {
      toast(e.message, "error");
    }
  }, [toast]);

  /** Add several products in one go (quiz result, buy again). Returns false on failure. */
  const addMany = useCallback(async (items, { open = true } = {}) => {
    try {
      const d = await api.post("/cart/bulk", { items });
      setCart(d);
      if (d.skipped?.length) toast(`เพิ่มไม่ได้ ${d.skipped.length} รายการ (สินค้าหมดหรือเกินสต็อก)`, "error");
      else toast(`เพิ่ม ${items.length} รายการลงตะกร้าแล้ว`, "ok");
      if (open) setCartOpen(true);
      return true;
    } catch (e) {
      toast(e.message, "error");
      return false;
    }
  }, [toast]);

  const login = useCallback(async (email, password) => {
    const d = await api.post("/auth/login", { email, password });
    setUser(d.user);
    await refreshCart();
    return d.user;
  }, [refreshCart]);

  const register = useCallback(async (body) => {
    const d = await api.post("/auth/register", body);
    setUser(d.user);
    await refreshCart();
    return d.user;
  }, [refreshCart]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
    setCart({ items: [], count: 0, subtotal: 0 });
    toast("ออกจากระบบแล้ว");
  }, [toast]);

  const value = useMemo(() => ({
    user, setUser, login, register, logout,
    cart, setCart, refreshCart, addToCart, addMany, setQty, cartOpen, setCartOpen,
    toast,
  }), [user, login, register, logout, cart, refreshCart, addToCart, addMany, setQty, cartOpen, toast]);

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind} ${t.leaving ? "leaving" : ""}`}>
            <span className="toast-ic"><Icon name={t.kind === "error" ? "x" : t.kind === "ok" ? "check" : "sparkle"} size={14} stroke={2.6} /></span>
            <span>{t.message}</span>
            {t.action && <button onClick={t.action.onClick}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}

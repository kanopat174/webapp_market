import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { AppProvider } from "./context/AppContext.jsx";
import Layout from "./components/Layout.jsx";
import { Empty } from "./components/ui.jsx";
import Home from "./pages/Home.jsx";
import Shop from "./pages/Shop.jsx";
import Product from "./pages/Product.jsx";
import Cart from "./pages/Cart.jsx";
import Checkout from "./pages/Checkout.jsx";
import Order, { SandboxPay } from "./pages/Order.jsx";
import Account from "./pages/Account.jsx";
import Help from "./pages/Help.jsx";
import { ForgotPassword, Login, Register, ResetPassword } from "./pages/Auth.jsx";
import Quiz from "./pages/Quiz.jsx";
import { AdminCoupons, AdminEmails, AdminLayout, AdminOrders, AdminProducts, AdminSubscriptions, Dashboard } from "./pages/admin/Admin.jsx";
import "./styles.css";
import "./features.css";

const NotFound = () => <Empty title="ไม่พบหน้านี้" action={<Link className="btn primary" to="/">กลับหน้าแรก</Link>}>ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายแล้ว</Empty>;

const router = createBrowserRouter([
  {
    element: <AppProvider><Layout /></AppProvider>,
    errorElement: <main className="wrap page"><Empty title="เกิดข้อผิดพลาด" action={<a className="btn primary" href="/">กลับหน้าแรก</a>}>ลองโหลดหน้านี้ใหม่อีกครั้ง</Empty></main>,
    children: [
      { path: "/", element: <Home /> },
      { path: "/shop", element: <Shop /> },
      { path: "/products/:slug", element: <Product /> },
      { path: "/cart", element: <Cart /> },
      { path: "/checkout", element: <Checkout /> },
      { path: "/pay/:orderNo", element: <SandboxPay /> },
      { path: "/orders/:orderNo", element: <Order /> },
      { path: "/account", element: <Account /> },
      { path: "/login", element: <Login /> },
      { path: "/register", element: <Register /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },
      { path: "/quiz", element: <Quiz /> },
      { path: "/help", element: <Help /> },
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "orders", element: <AdminOrders /> },
          { path: "products", element: <AdminProducts /> },
          { path: "coupons", element: <AdminCoupons /> },
          { path: "subscriptions", element: <AdminSubscriptions /> },
          { path: "emails", element: <AdminEmails /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Fade the loading screen out once the app has painted, keeping it up long enough not to flash.
const splash = document.getElementById("splash");
if (splash) {
  const wait = Math.max(0, 650 - performance.now());
  setTimeout(() => requestAnimationFrame(() => {
    splash.classList.add("done");
    document.documentElement.classList.add("app-ready");
    setTimeout(() => splash.remove(), 600);
  }), wait);
}

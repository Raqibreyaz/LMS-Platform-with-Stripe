import { Routes, Route } from "react-router-dom";
import Navbar from "./Navbar";
import Home from "./Home";
import Cart from "./Cart";
import { CheckoutForm, Return } from "./Stripe";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-10">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<CheckoutForm />} />
        <Route path="/return" element={<Return />} />
      </Routes>
    </div>
  );
}

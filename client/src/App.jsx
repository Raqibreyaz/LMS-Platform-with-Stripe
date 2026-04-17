import { Routes, Route } from "react-router-dom";
import Navbar from "./Navbar";
import Home from "./Home";
import Cart from "./Cart";
import Callback from './Callback'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-10">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/callback" element={<Callback />} />
      </Routes>
    </div>
  );
}

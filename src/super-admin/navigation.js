import { Activity, Boxes, ClipboardList, FolderOpen, LayoutDashboard, Settings, ShieldCheck, Users } from "lucide-react";
export const navigation = [
  ["overview", "Overview", LayoutDashboard], ["products", "Products", Boxes],
  ["categories", "Collections", FolderOpen], ["orders", "Orders", ClipboardList],
  ["users", "Users & access", Users], ["owners", "Super Admins", ShieldCheck],
  ["commerce", "Commerce tools", Activity], ["wallet", "Shop Wallet", ShieldCheck],
  ["settings", "Website settings", Settings], ["activity", "Activity log", Activity],
];
export const sectionPath = (section) => `/super-admin/${section === "overview" ? "dashboard" : section}`;

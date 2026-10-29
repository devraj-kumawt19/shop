import CatalogManager from "../super-admin/components/CatalogManager.jsx";

// Seller access is scoped to this account's own listings by the API.
export default function SellerPage() { return <CatalogManager seller />; }

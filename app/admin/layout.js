export const metadata = {
  title: { default: 'Admin', template: '%s · Admin · Yojigen Poketto' },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }) {
  return <div className="admin-root">{children}</div>;
}

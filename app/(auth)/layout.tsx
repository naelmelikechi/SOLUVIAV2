export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="auth-light-force flex min-h-screen items-center justify-center"
      style={
        {
          '--background': '#f5f7f5',
          '--foreground': '#1a2e1a',
          '--card': '#f8faf8',
          '--card-foreground': '#1a2e1a',
          '--border': '#d4e4d4',
          '--input': '#d4e4d4',
          '--primary': '#16a34a',
          '--primary-foreground': '#ffffff',
          '--muted': '#f0f5f0',
          '--muted-foreground': '#6b8a6b',
          '--ring': '#16a34a',
          '--destructive': '#dc2626',
          colorScheme: 'light',
          backgroundColor: '#f5f7f5',
          color: '#1a2e1a',
        } as React.CSSProperties
      }
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

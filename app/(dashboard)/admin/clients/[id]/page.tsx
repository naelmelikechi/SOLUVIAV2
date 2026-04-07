export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Client {id}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Fiche client — a implementer
      </p>
    </div>
  );
}

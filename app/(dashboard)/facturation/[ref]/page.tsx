export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Facture {ref}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Detail de la facture — a implementer
      </p>
    </div>
  );
}

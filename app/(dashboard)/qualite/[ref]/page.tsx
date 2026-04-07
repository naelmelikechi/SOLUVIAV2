export default async function QualiteDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Qualite — {ref}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Detail qualite du projet — a implementer
      </p>
    </div>
  );
}

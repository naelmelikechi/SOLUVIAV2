'use server';

export async function uploadClientDocument(
  clientId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  // Silence unused-variable warnings — params needed when Storage is wired
  void clientId;
  void formData;

  // TODO: implement with Supabase Storage
  return { success: false, error: 'Upload de documents bientôt disponible' };
}

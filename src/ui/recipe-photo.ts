const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 2560;

// Decode and re-encode locally so camera photos fit the private upload limit.
// The resulting JPEG contains pixels, without the original EXIF/location data.
export async function prepareRecipePhoto(file: File): Promise<File> {
  if (!file.size || file.size > MAX_INPUT_BYTES)
    throw new Error("Bitte wähle ein Foto mit höchstens 40 MB.");
  if (file.type === "image/svg+xml")
    throw new Error(
      "Dieses Bildformat kann nicht gelesen werden. Bitte wähle ein JPG, PNG oder WebP.",
    );
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width * height > 100_000_000)
      throw new Error(
        "Das Foto ist zu groß oder beschädigt. Bitte fotografiere das Rezept erneut.",
      );
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Das Foto konnte nicht vorbereitet werden. Bitte versuche es erneut.",
      );
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.92, 0.82, 0.7]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob?.size && blob.size <= MAX_UPLOAD_BYTES)
        return new File([blob], "rezeptfoto.jpg", { type: blob.type });
    }
    throw new Error(
      "Das Foto konnte nicht auf 5 MB verkleinert werden. Bitte wähle einen kleineren Ausschnitt.",
    );
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error(
      "Dieses Bildformat kann nicht gelesen werden. Bitte wähle ein JPG, PNG oder WebP.",
    );
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}

/**
 * Capture la page courante en image PNG (Blob) via l'API native du
 * navigateur `getDisplayMedia`.
 *
 * Pourquoi cette approche plutot que html-to-image / modern-screenshot ?
 * Les libs DOM-vers-canvas via SVG foreignObject echouent sur Tailwind v4
 * (oklch, color-mix, @layer) - rendu delave ou crash. La capture
 * native est pixel-perfect car effectuee par le navigateur lui-meme.
 *
 * Trade-off : un popup de permission "Partager l'onglet" s'affiche.
 * Si l'utilisateur refuse ou que l'API n'est pas dispo (Safari iOS),
 * on retourne null - la sheet s'ouvre alors sans capture auto et
 * l'utilisateur peut paste/upload manuellement.
 *
 * Hint Chrome/Edge : on demande explicitement `preferCurrentTab: true`
 * pour que l'onglet courant soit en haut de la liste de selection.
 */

interface DisplayMediaConstraintsWithCurrentTab {
  video?: DisplayMediaStreamOptions['video'];
  audio?: DisplayMediaStreamOptions['audio'];
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
}

export async function capturePageScreenshot(): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    console.warn('[bug-report] getDisplayMedia non supporte');
    return null;
  }

  let stream: MediaStream | null = null;
  try {
    const constraints: DisplayMediaConstraintsWithCurrentTab = {
      video: {
        displaySurface: 'browser',
        width: { ideal: window.innerWidth * window.devicePixelRatio },
        height: { ideal: window.innerHeight * window.devicePixelRatio },
      } as MediaTrackConstraints,
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'exclude',
    };

    stream = await navigator.mediaDevices.getDisplayMedia(
      constraints as DisplayMediaStreamOptions,
    );

    const track = stream.getVideoTracks()[0];
    if (!track) return null;

    // Recupere une frame via ImageCapture (Chrome/Edge) ou fallback canvas
    const blob = await grabFrame(stream, track);
    return blob;
  } catch (err) {
    // L'utilisateur a refuse / annule le partage : on log en debug
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      console.info('[bug-report] capture annulee par l utilisateur');
    } else {
      console.warn('[bug-report] capture echec', err);
    }
    return null;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}

async function grabFrame(
  stream: MediaStream,
  track: MediaStreamTrack,
): Promise<Blob | null> {
  // ImageCapture est dispo Chrome/Edge mais pas Firefox. On test puis
  // fallback sur le pipeline video element + canvas.
  type ImageCaptureCtor = new (track: MediaStreamTrack) => {
    grabFrame: () => Promise<ImageBitmap>;
  };
  const ImageCaptureRef = (
    window as unknown as { ImageCapture?: ImageCaptureCtor }
  ).ImageCapture;

  let bitmap: ImageBitmap | null = null;

  if (ImageCaptureRef) {
    try {
      const ic = new ImageCaptureRef(track);
      bitmap = await ic.grabFrame();
    } catch {
      bitmap = null;
    }
  }

  if (!bitmap) {
    bitmap = await fallbackGrab(stream);
  }
  if (!bitmap) return null;

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
}

async function fallbackGrab(stream: MediaStream): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = async () => {
      try {
        await video.play();
        // Attend une frame pour eviter de capturer un cadre noir
        await new Promise((r) => requestAnimationFrame(r));
        const bmp = await createImageBitmap(video);
        resolve(bmp);
      } catch {
        resolve(null);
      } finally {
        video.pause();
        video.srcObject = null;
      }
    };
  });
}

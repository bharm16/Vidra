import { Button } from "@promptstudio/system/components/ui/button";
import React, { useRef, useState } from "react";
import referenceIcon from "@/assets/design-system/reference.svg";

interface Props {
  onUpload: (file: File) => void | Promise<void>;
  disabled?: boolean;
  tile?: boolean;
}

/** The input's upload action summons a file picker; it creates no extra panel. */
export function ReferenceUploadButton({
  onUpload,
  disabled = false,
  tile = false,
}: Props): React.ReactElement {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = ""; // choosing the same file is an explicit retry
    if (!file || busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload this reference",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input
        ref={picker}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Reference picture file"
        data-testid="reference-picture-file"
        onChange={(event) => void handleChange(event)}
      />
      <Button
        type="button"
        variant="ghost"
        size={tile ? "icon-lg" : "sm"}
        className={tile ? "vidra-media-action__button" : undefined}
        aria-label="Upload reference picture"
        aria-busy={busy}
        disabled={disabled || busy}
        onClick={() => picker.current?.click()}
      >
        {tile ? (
          <span className="vidra-composer-icon">
            <img alt="" src={referenceIcon} />
          </span>
        ) : busy ? (
          "Uploading…"
        ) : (
          "Upload reference"
        )}
      </Button>
      {tile ? (
        <span className="vidra-media-action__label">
          {busy ? "Uploading…" : "Reference"}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-meta text-tool-text-subdued">
          {error}
        </span>
      ) : null}
    </>
  );
}

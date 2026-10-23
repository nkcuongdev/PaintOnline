import { useEffect, useRef, useState } from 'react';
import { codec, repo } from '@/app/storage';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { copyCheckpoint, previewCheckpoint } from '@/services/storage/checkpointRecovery';
import { toast } from '@/stores/ui';
import { t } from '@/i18n';
import { copyDegradedProject } from './actions';
import { formatTime, type OpenProject } from './session';

export function CheckpointRecovery({
  projectId,
  checkpointAt,
  project,
}: {
  projectId: string;
  checkpointAt: number | null;
  project?: OpenProject;
}) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let url: string | null = null;
    void previewCheckpoint(
      repo,
      projectId,
      codec(),
      controller.signal,
      project?.editor.memory.usedBytes ?? 0,
    ).then(
      (blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setImage(url);
      },
      (e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : t.checkpointRecovery.failed);
      },
    );
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      setImage(null);
      setError(null);
    };
  }, [open, projectId, project]);
  const copy = async (checkpoint: boolean) => {
    if (!checkpoint && !project) return;
    setBusy(true);
    try {
      const id = checkpoint
        ? await copyCheckpoint(repo, projectId, codec(), project?.editor.memory.usedBytes ?? 0)
        : project
          ? await copyDegradedProject(project)
          : null;
      if (!id || !mounted.current) return;
      navigate({ name: 'project', projectId: id });
    } catch (e) {
      toast('error', e instanceof Error ? e.message : t.checkpointRecovery.failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {project && <span>{t.checkpointRecovery.protected}</span>}
      {checkpointAt !== null && (
        <Button
          size="sm"
          variant="outline"
          data-testid="view-checkpoint"
          onClick={() => {
            setOpen(true);
          }}
        >
          {t.checkpointRecovery.view} · {formatTime(checkpointAt)}
        </Button>
      )}
      {project && (
        <Button
          size="sm"
          disabled={busy}
          data-testid="copy-degraded"
          onClick={() => {
            void copy(false);
          }}
        >
          {t.checkpointRecovery.copyDegraded}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t.projectFile.cancel} data-testid="checkpoint-preview">
          <DialogHeader>
            <DialogTitle>{t.checkpointRecovery.view}</DialogTitle>
            <DialogDescription>{t.checkpointRecovery.hint}</DialogDescription>
          </DialogHeader>
          {image && (
            <img
              src={image}
              alt={t.checkpointRecovery.view}
              className="mx-auto max-h-80 max-w-full"
              data-testid="checkpoint-image"
            />
          )}
          {error && <p role="alert">{error}</p>}
          {!image && !error && <p role="status">{t.editor.loading}</p>}
          <Button
            disabled={busy || !image || !!error}
            data-testid="copy-checkpoint"
            onClick={() => {
              void copy(true);
            }}
          >
            {t.checkpointRecovery.copy}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

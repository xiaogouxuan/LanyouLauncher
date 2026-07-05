import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/i18n";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  danger = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-on-surface-variant mb-5">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="text" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant={danger ? "danger" : "filled"}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmText || t("common.confirm")}
        </Button>
      </div>
    </Modal>
  );
}

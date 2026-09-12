import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dialog } from "radix-ui";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";

function RadixSpike() {
  return (
    <Dialog.Root>
      <Dialog.Trigger>開啟 Radix</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>Radix</Dialog.Title>
          <Dialog.Description>Radix Dialog 在 CSP 下的樣式注入</Dialog.Description>
          <Dialog.Close>關閉 Radix</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BaseSpike() {
  return (
    <BaseDialog.Root>
      <BaseDialog.Trigger>開啟 Base UI</BaseDialog.Trigger>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop />
        <BaseDialog.Popup>
          <BaseDialog.Title>Base UI</BaseDialog.Title>
          <BaseDialog.Description>Base UI Dialog 在 CSP 下的捲動鎖定</BaseDialog.Description>
          <BaseDialog.Close>關閉 Base UI</BaseDialog.Close>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RadixSpike />
    <BaseSpike />
    {/* Scroll lock is only observable when the page can scroll. */}
    <div style={{ height: "3000px" }} />
  </StrictMode>,
);

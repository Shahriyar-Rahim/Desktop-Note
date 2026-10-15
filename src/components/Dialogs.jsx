import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';

const DialogContext = createContext(null);
export const useDialogs = () => useContext(DialogContext);

const btn = 'rounded-lg px-3.5 py-1.5 text-sm font-medium';

// const { confirm, prompt, isOpen } = useDialogs();
//   if (await confirm({ title, message, confirmLabel, danger })) { ... }
//   const name = await prompt({ title, label, initial, validate });   // string | null
export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const open = useRef(false);

  const close = useCallback((result) => {
    setDialog((d) => { d?.resolve(result); return null; });
    open.current = false;
  }, []);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    open.current = true;
    setDialog({ kind: 'confirm', resolve, ...opts });
  }), []);

  const prompt = useCallback((opts) => new Promise((resolve) => {
    open.current = true;
    setDialog({ kind: 'prompt', resolve, ...opts });
  }), []);

  const value = useMemo(() => ({ confirm, prompt, isOpen: () => open.current }), [confirm, prompt]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog?.kind === 'confirm' && <ConfirmModal dialog={dialog} close={close} />}
      {dialog?.kind === 'prompt' && <PromptModal dialog={dialog} close={close} />}
    </DialogContext.Provider>
  );
}

function ConfirmModal({ dialog, close }) {
  return (
    <Modal title={dialog.title ?? 'Are you sure?'} onClose={() => close(false)}>
      <p className="mb-5 whitespace-pre-line text-sm text-stone-600 dark:text-stone-300">{dialog.message}</p>
      <div className="flex justify-end gap-2">
        <button data-autofocus className={`${btn} bg-stone-100 hover:bg-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600`} onClick={() => close(false)}>
          Cancel
        </button>
        <button
          className={`${btn} text-white ${dialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
          onClick={() => close(true)}
        >
          {dialog.confirmLabel ?? 'OK'}
        </button>
      </div>
    </Modal>
  );
}

function PromptModal({ dialog, close }) {
  const [value, setValue] = useState(dialog.initial ?? '');
  const error = dialog.validate ? dialog.validate(value) : null;
  const submit = (e) => { e.preventDefault(); if (!error) close(value.trim()); };
  return (
    <Modal title={dialog.title} onClose={() => close(null)}>
      <form onSubmit={submit}>
        <label className="mb-1 block text-sm text-stone-600 dark:text-stone-300" htmlFor="prompt-input">{dialog.label}</label>
        <input
          id="prompt-input"
          data-autofocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={dialog.maxLength ?? 200}
          className="mb-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900"
        />
        <p className="mb-4 h-4 text-xs text-red-600 dark:text-red-400">{value && error ? error : ''}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={`${btn} bg-stone-100 hover:bg-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600`} onClick={() => close(null)}>Cancel</button>
          <button type="submit" disabled={Boolean(error)} className={`${btn} bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40`}>
            {dialog.confirmLabel ?? 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

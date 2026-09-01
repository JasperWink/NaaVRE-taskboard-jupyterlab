// DocumentRegistry.IModel boilerplate for the Yjs-backed `.naavretb` document.
//
// Forked from the NaaVRE workflow extension (copied, not shared, to avoid a
// build-time dependency) — fix bugs in both. Derived from jupyterlab/
// extension-examples documents/src/model.ts, Copyright 2023 Project Jupyter
// Contributors, BSD 3-Clause.

import { YDocument, DocumentChange } from '@jupyter/ydoc';
import { IChangedArgs } from '@jupyterlab/coreutils';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { PartialJSONValue } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';

/**
 * Base DocumentModel for documents whose content lives in a YDocument shared
 * model. Subclasses add typed content accessors and implement
 * `onContentChanged`.
 */
export abstract class SharedDocumentModel<
  TChange extends DocumentChange,
  TShared extends YDocument<TChange>
> implements DocumentRegistry.IModel
{
  /**
   * @param createSharedModel Used when the context provides no shared model
   * (i.e. outside collaboration).
   */
  constructor(
    options: DocumentRegistry.IModelOptions<TShared>,
    createSharedModel: () => TShared
  ) {
    this._collaborationEnabled = !!options.collaborationEnabled;
    this.sharedModel = options.sharedModel ?? createSharedModel();

    // Listening for changes on the shared model to propagate them
    this.sharedModel.changed.connect(this._onSharedModelChanged);
    this.sharedModel.awareness.on('change', this._onClientChanged);
  }

  /** The shared document model. */
  readonly sharedModel: TShared;

  /** Whether the model is collaborative or not. */
  get collaborative(): boolean {
    return this._collaborationEnabled;
  }

  /** Unused: the board has no kernel. */
  readonly defaultKernelName = '';

  /** Unused: the board has no kernel. */
  readonly defaultKernelLanguage = '';

  /** Whether the content differs from what is saved on disk. */
  get dirty(): boolean {
    return this._dirty;
  }
  set dirty(newValue: boolean) {
    const oldValue = this._dirty;
    if (newValue === oldValue) {
      return;
    }
    this._dirty = newValue;
    this.triggerStateChange({ name: 'dirty', oldValue, newValue });
  }

  /** Whether the model is disposed. */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** The read only state of the document. */
  get readOnly(): boolean {
    return this._readOnly;
  }
  set readOnly(newValue: boolean) {
    if (newValue === this._readOnly) {
      return;
    }
    const oldValue = this._readOnly;
    this._readOnly = newValue;
    this.triggerStateChange({ name: 'readOnly', oldValue, newValue });
  }

  /** Per-document id, unique to each browser sharing it. */
  get clientId(): number {
    return this.sharedModel.awareness.clientID;
  }

  /** Emitted when the set of clients sharing this document changes. */
  get clientChanged(): ISignal<this, Map<number, any>> {
    return this._clientChanged;
  }

  /** Emitted when the data stored in the model changes. */
  get contentChanged(): ISignal<this, void> {
    return this._contentChanged;
  }

  /** Emitted when the model's metadata or attributes change. */
  get stateChanged(): ISignal<this, IChangedArgs<any>> {
    return this._stateChanged;
  }

  /** Dispose of the resources held by the model. */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
  }

  /** Serialize for saving to disk; called by the context. */
  toString(): string {
    return this.sharedModel.getSource() as string;
  }

  /** Load from disk; called by the context. */
  fromString(data: string): void {
    this.sharedModel.setSource(data);
  }

  /** Only used by documents of format 'json'; ours uses toString. */
  toJSON(): PartialJSONValue {
    return JSON.parse(this.toString() || 'null');
  }

  /** Only used by documents of format 'json'; ours uses fromString. */
  fromJSON(value: PartialJSONValue): void {
    this.fromString(JSON.stringify(value));
  }

  /** Initialize the model with its current state. */
  initialize(): void {
    return;
  }

  /**
   * Translate a shared-model change into content signals: call
   * `triggerContentChange()` when the content changed. State changes are
   * handled by this class.
   */
  protected abstract onContentChanged(changes: TChange): void;

  /** Trigger a state change signal. */
  protected triggerStateChange(args: IChangedArgs<any>): void {
    this._stateChanged.emit(args);
  }

  /** Trigger a content changed signal. */
  protected triggerContentChange(): void {
    this._contentChanged.emit(void 0);
    this.dirty = true;
  }

  /** Propagates client changes on the shared model to the DocumentWidget. */
  private _onClientChanged = () => {
    const clients = this.sharedModel.awareness.getStates();
    this._clientChanged.emit(clients);
  };

  /** Propagates content changes on the shared model to the DocumentWidget. */
  private _onSharedModelChanged = (
    _sender: TShared,
    changes: TChange
  ): void => {
    this.onContentChanged(changes);
    if (changes.stateChange) {
      changes.stateChange.forEach(value => {
        if (value.name === 'dirty') {
          // Always set: `dirty` syncs one way, shared model -> _dirty.
          this.dirty = value.newValue;
        } else if (value.oldValue !== value.newValue) {
          this.triggerStateChange({
            newValue: undefined,
            oldValue: undefined,
            ...value
          });
        }
      });
    }
  };

  private _dirty = false;
  private _isDisposed = false;
  private _readOnly = false;
  private _clientChanged = new Signal<this, Map<number, any>>(this);
  private _contentChanged = new Signal<this, void>(this);
  private _collaborationEnabled: boolean;
  private _stateChanged = new Signal<this, IChangedArgs<any>>(this);
}

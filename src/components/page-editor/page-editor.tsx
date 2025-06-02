import { h } from 'preact';
import { EditorProvider } from '../../store/editor-сontext';
import { ClickListener } from '../click-listener';

export function PageEditor(config: any) {
  return (
    <EditorProvider>
      <ClickListener />
    </EditorProvider>
  );
}
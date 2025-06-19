import { h } from 'preact';
import { ClickListener } from '../click-listener';
import { fetchPatches } from '@/features/patches/api';
import { useEffect } from 'react';
import EditorLoader from '../editor-loader';

export function PageEditor(config: any) {

  return (
    <EditorLoader>
      <ClickListener />
    </EditorLoader>
  );
}
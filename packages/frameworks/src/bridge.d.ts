export type FrameworkRoot = Element | Document;
export type FrameworkRootEntry = {
  root: FrameworkRoot;
  framework: 'react' | 'vue';
  phase: 'pending' | 'ready' | 'unmounted';
  mode: 'csr' | 'hydrate';
  generation: number;
};
export declare const FRAMEWORK_ROOT_EVENT: 'lykar:framework-root';
export declare const FRAMEWORK_ROOTS_KEY: symbol;
export declare function frameworkRootsSnapshot(): FrameworkRootEntry[];
export declare function beginFrameworkRoot(root: FrameworkRoot, framework: FrameworkRootEntry['framework'], mode: FrameworkRootEntry['mode']): number;
export declare function commitFrameworkRoot(root: FrameworkRoot, generation: number): void;
export declare function suspendFrameworkRoot(root: FrameworkRoot, generation: number): void;
export declare function unmountFrameworkRoot(root: FrameworkRoot): void;

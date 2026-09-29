export declare function lykarEsbuildPlugin(): {name: string; setup(build: {onResolve(options: {filter: RegExp}, callback: (args: {path: string; importer: string}) => {path: string} | undefined): void}): void};
export declare function lykarVitePlugin(): {name: string; enforce: 'pre'; resolveId(source: string, importer?: string): string | undefined};

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden across frontend modules',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'layer-config-and-design-system-isolated',
      severity: 'error',
      comment: 'config and design-system must not depend on utils, api, features, components, or pages',
      from: {
        path: '^src/(config|design-system)',
      },
      to: {
        path: '^src/(utils|api|features|components|pages)',
      },
    },
    {
      name: 'layer-utils-and-api-boundaries',
      severity: 'error',
      comment: 'utils and api layers must not depend on features, components, or pages',
      from: {
        path: '^src/(utils|api)',
        pathNot: '^src/api/chatTransfer\\.ts',
      },
      to: {
        path: '^src/(features|components|pages)',
      },
    },
    {
      name: 'layer-features-and-components-boundaries',
      severity: 'error',
      comment: 'features and components must not depend on pages',
      from: {
        path: '^src/(features|components)',
        pathNot: '^src/components/Storage(Canvases|Checklists|Collections)\\.tsx',
      },
      to: {
        path: '^src/pages',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: './tsconfig.json',
    },
  },
};

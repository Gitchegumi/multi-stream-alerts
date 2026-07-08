import type { CanvasElement, CanvasSettings } from '@/lib/canvas-schema';

type WorkspaceAssetClient = {
  workspaceAsset: {
    findMany(args: {
      where: { channelId: string; id: { in: string[] } };
      select: { id: true; assetType: true };
    }): Promise<{ id: string; assetType: string }[]>;
  };
};

/**
 * Stamp the authoritative stored-asset type onto `alert-image` bindings so the
 * overlay renders bound assets as image vs. video without needing database
 * access. Used by the browser-source page at load and by the settings publish
 * path when a canvas is saved, so both deliver identically-resolved settings.
 */
export async function resolveCanvasSettingsAssetTypes(
  settings: CanvasSettings,
  channelId: string,
  db: WorkspaceAssetClient,
): Promise<CanvasSettings> {
  const assetIds = settings.elements.flatMap((element) =>
    element.type === 'alert-image' && element.bindings.assetId ? [element.bindings.assetId] : [],
  );
  if (!assetIds.length) return settings;

  const assets = await db.workspaceAsset.findMany({
    where: { channelId, id: { in: [...new Set(assetIds)] } },
    select: { id: true, assetType: true },
  });
  const assetTypes = new Map(assets.map((asset) => [asset.id, asset.assetType]));

  return {
    ...settings,
    elements: settings.elements.map((element): CanvasElement => {
      if (element.type !== 'alert-image' || !element.bindings.assetId) return element;
      const assetType = assetTypes.get(element.bindings.assetId);
      if (assetType !== 'image' && assetType !== 'video') return element;
      return {
        ...element,
        bindings: {
          ...element.bindings,
          assetType,
        },
      };
    }),
  } satisfies CanvasSettings;
}

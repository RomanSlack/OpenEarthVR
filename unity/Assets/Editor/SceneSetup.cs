using UnityEditor;
using UnityEngine;
using TMPro;

namespace OpenEarthVR.Editor
{
    /// <summary>
    /// Menu item to auto-create the initial scene hierarchy.
    /// Run via: OpenEarthVR > Setup Scene
    /// </summary>
    public static class SceneSetup
    {
        [MenuItem("OpenEarthVR/Setup Scene")]
        public static void SetupScene()
        {
            // ── ApiClient (singleton) ──
            var apiClientGo = new GameObject("ApiClient");
            apiClientGo.AddComponent<Core.ApiClient>();

            // ── AppStateMachine ──
            var stateMachineGo = new GameObject("AppStateMachine");
            var stateMachine = stateMachineGo.AddComponent<Core.AppStateMachine>();

            // ── Globe Root ──
            var globeRoot = new GameObject("GlobeRoot");
            // CesiumGeoreference and Cesium3DTileset must be added manually
            // after the Cesium package is imported
            var globeManager = globeRoot.AddComponent<Core.GlobeManager>();
            var globeInput = globeRoot.AddComponent<Core.GlobeVRInput>();

            // ── PanoSphere Root ──
            var panoRoot = new GameObject("PanoSphereRoot");
            panoRoot.SetActive(false);

            var panoSphereGo = new GameObject("PanoSphere");
            panoSphereGo.transform.SetParent(panoRoot.transform);
            panoSphereGo.AddComponent<MeshFilter>();
            panoSphereGo.AddComponent<MeshRenderer>();
            var panoSphere = panoSphereGo.AddComponent<Core.PanoSphere>();

            var tileLoaderGo = new GameObject("TileLoader");
            tileLoaderGo.transform.SetParent(panoRoot.transform);
            tileLoaderGo.AddComponent<Core.TileLoader>();

            var panoInputGo = new GameObject("PanoVRInput");
            panoInputGo.transform.SetParent(panoRoot.transform);
            panoInputGo.AddComponent<Core.PanoVRInput>();

            // ── Nav Orb Container ──
            var navOrbContainer = new GameObject("NavOrbContainer");
            navOrbContainer.SetActive(false);
            var navOrbs = navOrbContainer.AddComponent<Core.NavOrbs>();

            // ── Fade Overlay ──
            // Small sphere around camera with fade shader
            var fadeGo = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            fadeGo.name = "FadeOverlay";
            fadeGo.transform.localScale = Vector3.one * 0.5f;
            // Remove collider
            Object.DestroyImmediate(fadeGo.GetComponent<Collider>());
            var fadeOverlay = fadeGo.AddComponent<Core.FadeOverlay>();

            // ── Copyright Badge ──
            var copyrightGo = new GameObject("CopyrightBadge");
            var tmp = copyrightGo.AddComponent<TextMeshPro>();
            tmp.fontSize = 2;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.text = "\u00a9 Google";
            var copyrightBadge = copyrightGo.AddComponent<Core.CopyrightBadge>();

            // ── Directional Light ──
            var lightGo = new GameObject("Directional Light");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1f;
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            // ── Wire up AppStateMachine references ──
            // These need to be set via SerializedObject since fields are [SerializeField] private
            var so = new SerializedObject(stateMachine);
            so.FindProperty("globeRoot").objectReferenceValue = globeRoot;
            so.FindProperty("panoSphereRoot").objectReferenceValue = panoRoot;
            so.FindProperty("navOrbContainer").objectReferenceValue = navOrbContainer;
            so.FindProperty("fadeOverlay").objectReferenceValue = fadeOverlay;
            so.FindProperty("copyrightBadge").objectReferenceValue = copyrightBadge;
            so.FindProperty("globeManager").objectReferenceValue = globeManager;
            so.FindProperty("panoSphere").objectReferenceValue = panoSphere;
            so.FindProperty("tileLoader").objectReferenceValue = tileLoaderGo.GetComponent<Core.TileLoader>();
            so.FindProperty("navOrbs").objectReferenceValue = navOrbs;
            so.ApplyModifiedProperties();

            Debug.Log("OpenEarthVR scene hierarchy created. Next steps:\n" +
                      "1. Add XR Origin (Setup Rig) from XR Interaction Toolkit\n" +
                      "2. Add CesiumGeoreference + Cesium3DTileset to GlobeRoot\n" +
                      "3. Assign PanoUnlit material to PanoSphere\n" +
                      "4. Configure OpenVR in XR Management settings\n" +
                      "5. Wire VR controller references in GlobeVRInput and PanoVRInput");
        }
    }
}

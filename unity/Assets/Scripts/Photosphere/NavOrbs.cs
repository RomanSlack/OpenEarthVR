using System;
using System.Collections.Generic;
using UnityEngine;

namespace OpenEarthVR.Core
{
    /// <summary>
    /// Spawns navigation link orbs at compass headings from panorama metadata.
    /// Port of the nav orb logic from PanoView.ts.
    /// </summary>
    public class NavOrbs : MonoBehaviour
    {
        [Header("Orb Settings")]
        [SerializeField] private GameObject navOrbPrefab;
        [SerializeField] private float orbRadius = 80f;
        [SerializeField] private float orbY = -50f;
        [SerializeField] private float discRadius = 6f;

        [Header("Visual")]
        [SerializeField] private Color orbColor = new Color(0.31f, 0.76f, 0.97f, 1f); // #4fc3f7

        private readonly List<OrbData> orbs = new();
        private Action<PanoLink> onNavigate;
        private GameObject hoveredOrb;

        private struct OrbData
        {
            public GameObject gameObject;
            public MeshRenderer discRenderer;
            public MeshRenderer glowRenderer;
            public PanoLink link;
            public float phase;
        }

        /// <summary>
        /// Spawn orbs for each navigation link.
        /// </summary>
        public void SpawnOrbs(PanoLink[] links, float panoHeading, Action<PanoLink> navigateCallback)
        {
            ClearOrbs();
            onNavigate = navigateCallback;

            for (int i = 0; i < links.Length; i++)
            {
                var link = links[i];
                float headingRad = link.heading * Mathf.Deg2Rad;

                // Position on circle at compass heading
                Vector3 position = new Vector3(
                    Mathf.Sin(headingRad) * orbRadius,
                    orbY,
                    -Mathf.Cos(headingRad) * orbRadius
                );

                GameObject orb;
                if (navOrbPrefab != null)
                {
                    orb = Instantiate(navOrbPrefab, transform);
                }
                else
                {
                    orb = CreateOrbProcedural();
                    orb.transform.SetParent(transform);
                }

                orb.transform.localPosition = position;
                // Face upward
                orb.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);

                // Tag for raycasting
                orb.layer = LayerMask.NameToLayer("UI");

                // Store link data for click handling
                var clickable = orb.AddComponent<NavOrbClickable>();
                clickable.Link = link;

                // Get renderers
                var renderers = orb.GetComponentsInChildren<MeshRenderer>();
                MeshRenderer disc = renderers.Length > 0 ? renderers[0] : null;
                MeshRenderer glow = renderers.Length > 1 ? renderers[1] : null;

                orbs.Add(new OrbData
                {
                    gameObject = orb,
                    discRenderer = disc,
                    glowRenderer = glow,
                    link = link,
                    phase = i * 0.8f
                });
            }
        }

        /// <summary>
        /// Remove all orbs.
        /// </summary>
        public void ClearOrbs()
        {
            foreach (var orb in orbs)
            {
                if (orb.gameObject != null)
                    Destroy(orb.gameObject);
            }
            orbs.Clear();
            onNavigate = null;
            hoveredOrb = null;
        }

        /// <summary>
        /// Try to select an orb from a VR controller ray.
        /// Returns true if an orb was selected.
        /// </summary>
        public bool TrySelect(Ray ray)
        {
            if (Physics.Raycast(ray, out RaycastHit hit, 200f))
            {
                var clickable = hit.collider.GetComponentInParent<NavOrbClickable>();
                if (clickable != null)
                {
                    Debug.Log($"Nav orb selected: {clickable.Link.panoId}");
                    onNavigate?.Invoke(clickable.Link);
                    return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Update hover state from a VR ray. Returns true if hovering an orb.
        /// </summary>
        public bool UpdateHover(Ray ray)
        {
            GameObject newHover = null;

            if (Physics.Raycast(ray, out RaycastHit hit, 200f))
            {
                var clickable = hit.collider.GetComponentInParent<NavOrbClickable>();
                if (clickable != null)
                    newHover = clickable.gameObject;
            }

            bool changed = hoveredOrb != newHover;
            hoveredOrb = newHover;
            return newHover != null;
        }

        private void Update()
        {
            // Animate orbs — pulse opacity and scale
            float t = Time.time * 2f;

            foreach (var orb in orbs)
            {
                if (orb.gameObject == null) continue;

                float sine = Mathf.Sin(t + orb.phase);
                float opacity = 0.65f + 0.2f * sine;
                bool isHovered = orb.gameObject == hoveredOrb;
                float scale = isHovered ? 1.3f : (1f + 0.08f * sine);

                orb.gameObject.transform.localScale = Vector3.one * scale;

                if (orb.discRenderer != null)
                {
                    var mat = orb.discRenderer.material;
                    Color c = orbColor;
                    c.a = opacity;
                    mat.color = c;
                }

                if (orb.glowRenderer != null)
                {
                    var mat = orb.glowRenderer.material;
                    Color c = orbColor;
                    c.a = opacity * 0.4f;
                    mat.color = c;
                }
            }
        }

        /// <summary>
        /// Create an orb procedurally (disc + glow ring) if no prefab assigned.
        /// </summary>
        private GameObject CreateOrbProcedural()
        {
            var orb = new GameObject("NavOrb");

            // Disc
            var disc = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            disc.name = "Disc";
            disc.transform.SetParent(orb.transform);
            disc.transform.localPosition = Vector3.zero;
            disc.transform.localScale = new Vector3(discRadius * 2f, 0.1f, discRadius * 2f);

            var discMat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            discMat.color = orbColor;
            discMat.SetFloat("_Surface", 1); // Transparent
            discMat.SetFloat("_Blend", 1);   // Additive
            EnableTransparency(discMat);
            disc.GetComponent<MeshRenderer>().material = discMat;

            // Glow ring (larger cylinder behind)
            var glow = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            glow.name = "Glow";
            glow.transform.SetParent(orb.transform);
            glow.transform.localPosition = new Vector3(0f, -0.05f, 0f);
            glow.transform.localScale = new Vector3(discRadius * 3.3f, 0.05f, discRadius * 3.3f);
            // Remove collider from glow so it doesn't interfere with raycasting
            var glowCollider = glow.GetComponent<Collider>();
            if (glowCollider != null) Destroy(glowCollider);

            var glowMat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            Color glowColor = orbColor;
            glowColor.a = 0.35f;
            glowMat.color = glowColor;
            glowMat.SetFloat("_Surface", 1);
            glowMat.SetFloat("_Blend", 1);
            EnableTransparency(glowMat);
            glow.GetComponent<MeshRenderer>().material = glowMat;

            return orb;
        }

        private static void EnableTransparency(Material mat)
        {
            mat.SetOverrideTag("RenderType", "Transparent");
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.One);
            mat.SetInt("_ZWrite", 0);
            mat.renderQueue = 3000;
        }

        private void OnDestroy()
        {
            ClearOrbs();
        }
    }

    /// <summary>
    /// Simple component attached to each nav orb for click identification.
    /// </summary>
    public class NavOrbClickable : MonoBehaviour
    {
        public PanoLink Link { get; set; }
    }
}

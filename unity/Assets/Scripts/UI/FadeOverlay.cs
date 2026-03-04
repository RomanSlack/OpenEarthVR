using System.Collections;
using UnityEngine;

namespace OpenEarthVR.Core
{
    /// <summary>
    /// Full-screen black fade overlay for transitions between states.
    /// Renders as a sphere around the camera (works in VR unlike screen quads).
    /// </summary>
    [RequireComponent(typeof(MeshRenderer))]
    public class FadeOverlay : MonoBehaviour
    {
        [SerializeField] private Material fadeMaterial;

        private MeshRenderer meshRenderer;
        private static readonly int AlphaProperty = Shader.PropertyToID("_Alpha");

        private void Awake()
        {
            meshRenderer = GetComponent<MeshRenderer>();

            if (fadeMaterial == null)
            {
                // Create a default fade material
                fadeMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
                fadeMaterial.color = Color.black;
                EnableTransparency(fadeMaterial);
            }

            meshRenderer.material = fadeMaterial;
            SetAlpha(0f);
            meshRenderer.enabled = false;
        }

        /// <summary>
        /// Fade to black over the given duration.
        /// </summary>
        public IEnumerator FadeIn(float duration)
        {
            meshRenderer.enabled = true;
            yield return AnimateAlpha(0f, 1f, duration);
        }

        /// <summary>
        /// Fade from black over the given duration.
        /// </summary>
        public IEnumerator FadeOut(float duration)
        {
            yield return AnimateAlpha(1f, 0f, duration);
            meshRenderer.enabled = false;
        }

        private IEnumerator AnimateAlpha(float from, float to, float duration)
        {
            float elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / duration);
                // Smooth ease
                t = t * t * (3f - 2f * t);
                SetAlpha(Mathf.Lerp(from, to, t));
                yield return null;
            }
            SetAlpha(to);
        }

        private void SetAlpha(float alpha)
        {
            if (fadeMaterial == null) return;
            Color c = fadeMaterial.color;
            c.a = alpha;
            fadeMaterial.color = c;

            if (fadeMaterial.HasProperty(AlphaProperty))
                fadeMaterial.SetFloat(AlphaProperty, alpha);
        }

        private static void EnableTransparency(Material mat)
        {
            mat.SetOverrideTag("RenderType", "Transparent");
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            mat.SetInt("_ZWrite", 0);
            mat.renderQueue = 4000; // Render on top
        }
    }
}

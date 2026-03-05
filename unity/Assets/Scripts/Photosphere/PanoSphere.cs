using UnityEngine;

namespace OpenEarthVR.Core
{
    /// <summary>
    /// Inverted sphere mesh for photosphere rendering.
    /// Equivalent to Three.js SphereGeometry with scale(-1,1,1).
    /// </summary>
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class PanoSphere : MonoBehaviour
    {
        [Header("Sphere Settings")]
        [SerializeField] private float radius = 500f;
        [SerializeField] private int widthSegments = 80;
        [SerializeField] private int heightSegments = 60;

        [Header("Material")]
        [SerializeField] private Material panoMaterial;

        private MeshRenderer meshRenderer;
        private Texture2D currentTexture;
        private float targetAlpha = 0f;
        private bool isFadingIn;

        private void Awake()
        {
            meshRenderer = GetComponent<MeshRenderer>();
            GenerateInvertedSphere();
        }

        /// <summary>
        /// Apply a stitched panorama texture with heading rotation.
        /// </summary>
        public void ApplyTexture(Texture2D texture, float heading)
        {
            if (texture == null) return;

            // Dispose old texture
            if (currentTexture != null && currentTexture != texture)
            {
                Destroy(currentTexture);
            }
            currentTexture = texture;

            // Apply to material
            meshRenderer.material.mainTexture = texture;

            // Rotate sphere by heading (Y axis) to align geographic north
            transform.localRotation = Quaternion.Euler(0f, heading, 0f);

            // Handle fade-in
            float currentAlpha = meshRenderer.material.GetFloat("_Alpha");
            if (currentAlpha >= 0.9f)
            {
                // Already visible (coarse→fine swap), snap to full opacity
                meshRenderer.material.SetFloat("_Alpha", 1f);
            }
            else
            {
                // First load, start fade-in
                isFadingIn = true;
                targetAlpha = 1f;
            }
        }

        /// <summary>
        /// Reset the photosphere for a new panorama.
        /// </summary>
        public void Reset()
        {
            if (currentTexture != null)
            {
                Destroy(currentTexture);
                currentTexture = null;
            }

            if (meshRenderer != null && meshRenderer.material != null)
            {
                meshRenderer.material.mainTexture = null;
                meshRenderer.material.SetFloat("_Alpha", 0f);
            }
            isFadingIn = false;
            targetAlpha = 0f;
            transform.localRotation = Quaternion.identity;
        }

        private void Update()
        {
            if (!isFadingIn) return;

            float alpha = meshRenderer.material.GetFloat("_Alpha");
            alpha = Mathf.MoveTowards(alpha, targetAlpha, 2.5f * Time.deltaTime);
            meshRenderer.material.SetFloat("_Alpha", alpha);

            if (Mathf.Approximately(alpha, targetAlpha))
            {
                isFadingIn = false;
            }
        }

        private void GenerateInvertedSphere()
        {
            var mesh = new Mesh();
            mesh.name = "InvertedSphere";

            int vertCount = (widthSegments + 1) * (heightSegments + 1);
            var vertices = new Vector3[vertCount];
            var normals = new Vector3[vertCount];
            var uvs = new Vector2[vertCount];

            int index = 0;
            for (int y = 0; y <= heightSegments; y++)
            {
                float v = (float)y / heightSegments;
                float phi = v * Mathf.PI;

                for (int x = 0; x <= widthSegments; x++)
                {
                    float u = (float)x / widthSegments;
                    float theta = u * 2f * Mathf.PI;

                    // Standard sphere vertex
                    float px = -radius * Mathf.Sin(phi) * Mathf.Cos(theta);
                    float py = radius * Mathf.Cos(phi);
                    float pz = radius * Mathf.Sin(phi) * Mathf.Sin(theta);

                    vertices[index] = new Vector3(px, py, pz);
                    // Inward-facing normals
                    normals[index] = -new Vector3(px, py, pz).normalized;
                    // UV: flip U to correct for inverted winding
                    uvs[index] = new Vector2(1f - u, 1f - v);
                    index++;
                }
            }

            // Triangles with inverted winding order
            int triCount = widthSegments * heightSegments * 6;
            var triangles = new int[triCount];
            int tri = 0;
            for (int y = 0; y < heightSegments; y++)
            {
                for (int x = 0; x < widthSegments; x++)
                {
                    int current = y * (widthSegments + 1) + x;
                    int next = current + widthSegments + 1;

                    // Inverted winding for inside-facing
                    triangles[tri++] = current;
                    triangles[tri++] = current + 1;
                    triangles[tri++] = next;

                    triangles[tri++] = next;
                    triangles[tri++] = current + 1;
                    triangles[tri++] = next + 1;
                }
            }

            mesh.vertices = vertices;
            mesh.normals = normals;
            mesh.uv = uvs;
            mesh.triangles = triangles;

            GetComponent<MeshFilter>().mesh = mesh;
            meshRenderer.material = panoMaterial;
        }

        private void OnDestroy()
        {
            if (currentTexture != null)
                Destroy(currentTexture);
        }
    }
}

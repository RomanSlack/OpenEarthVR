using UnityEngine;
using TMPro;

namespace OpenEarthVR.Core
{
    /// <summary>
    /// World-space copyright badge that follows the VR camera.
    /// Displays Google attribution as required.
    /// </summary>
    public class CopyrightBadge : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private TextMeshPro textMesh;
        [SerializeField] private Transform vrCamera;

        [Header("Positioning")]
        [SerializeField] private float distanceFromCamera = 3f;
        [SerializeField] private float verticalOffset = -1.5f;

        private bool isVisible;

        private void Awake()
        {
            if (textMesh == null)
                textMesh = GetComponentInChildren<TextMeshPro>();

            Hide();
        }

        public void Show(string copyrightText)
        {
            if (textMesh != null)
                textMesh.text = copyrightText;

            gameObject.SetActive(true);
            isVisible = true;
        }

        public void Hide()
        {
            gameObject.SetActive(false);
            isVisible = false;
        }

        private void LateUpdate()
        {
            if (!isVisible || vrCamera == null) return;

            // Position in front of and below the camera
            Vector3 forward = vrCamera.forward;
            forward.y = 0;
            forward.Normalize();

            transform.position = vrCamera.position
                + forward * distanceFromCamera
                + Vector3.up * verticalOffset;

            // Face the camera
            transform.LookAt(vrCamera.position);
            transform.Rotate(0, 180, 0);
        }
    }
}

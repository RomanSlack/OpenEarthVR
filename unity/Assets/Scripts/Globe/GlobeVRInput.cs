using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.XR.Interaction.Toolkit;
using UnityEngine.XR.Interaction.Toolkit.Inputs.Readers;

namespace OpenEarthVR.Core
{
    /// <summary>
    /// VR input for globe mode: joystick orbit/zoom, trigger to pick location.
    /// </summary>
    public class GlobeVRInput : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private GlobeManager globeManager;
        [SerializeField] private Transform xrOrigin;
        [SerializeField] private Transform rightController;

        [Header("Input Actions")]
        [SerializeField] private InputActionReference leftJoystick;
        [SerializeField] private InputActionReference rightJoystick;
        [SerializeField] private InputActionReference triggerAction;

        [Header("Orbit Settings")]
        [SerializeField] private float orbitSpeed = 50f;
        [SerializeField] private float zoomSpeed = 100f;
        [SerializeField] private float minDistance = 200f;
        [SerializeField] private float maxDistance = 50000f;

        private float currentDistance = 5000f;
        private float orbitYaw;
        private float orbitPitch = 45f;

        private const float Deadzone = 0.15f;

        private void OnEnable()
        {
            if (triggerAction != null && triggerAction.action != null)
                triggerAction.action.Enable();
            if (leftJoystick != null && leftJoystick.action != null)
                leftJoystick.action.Enable();
            if (rightJoystick != null && rightJoystick.action != null)
                rightJoystick.action.Enable();
        }

        private void Update()
        {
            if (AppStateMachine.Instance == null ||
                AppStateMachine.Instance.CurrentState != AppState.Globe)
                return;

            HandleOrbit();
            HandleZoom();
            HandleTrigger();
        }

        private void HandleOrbit()
        {
            if (leftJoystick == null || leftJoystick.action == null) return;
            var stick = leftJoystick.action.ReadValue<Vector2>();

            if (Mathf.Abs(stick.x) > Deadzone)
                orbitYaw += stick.x * orbitSpeed * Time.deltaTime;
            if (Mathf.Abs(stick.y) > Deadzone)
                orbitPitch = Mathf.Clamp(orbitPitch - stick.y * orbitSpeed * Time.deltaTime, 10f, 85f);

            UpdateCameraOrbit();
        }

        private void HandleZoom()
        {
            if (rightJoystick == null || rightJoystick.action == null) return;
            var stick = rightJoystick.action.ReadValue<Vector2>();

            if (Mathf.Abs(stick.y) > Deadzone)
            {
                currentDistance -= stick.y * zoomSpeed * Time.deltaTime;
                currentDistance = Mathf.Clamp(currentDistance, minDistance, maxDistance);
            }

            UpdateCameraOrbit();
        }

        private void UpdateCameraOrbit()
        {
            if (xrOrigin == null) return;

            float yawRad = orbitYaw * Mathf.Deg2Rad;
            float pitchRad = orbitPitch * Mathf.Deg2Rad;

            Vector3 offset = new Vector3(
                currentDistance * Mathf.Cos(pitchRad) * Mathf.Sin(yawRad),
                currentDistance * Mathf.Sin(pitchRad),
                currentDistance * Mathf.Cos(pitchRad) * Mathf.Cos(yawRad)
            );

            xrOrigin.position = offset;
            xrOrigin.LookAt(Vector3.zero);
        }

        private void HandleTrigger()
        {
            if (triggerAction == null || triggerAction.action == null) return;
            if (!triggerAction.action.WasPressedThisFrame()) return;
            if (rightController == null || globeManager == null) return;

            Ray ray = new Ray(
                rightController.position,
                rightController.forward
            );

            if (globeManager.RaycastGlobe(ray, out double lat, out double lng))
            {
                Debug.Log($"Globe click: lat={lat:F4}, lng={lng:F4}");
                AppStateMachine.Instance.EnterPhotosphere(lat, lng);
            }
        }
    }
}

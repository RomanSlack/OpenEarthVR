using UnityEngine;
using UnityEngine.InputSystem;

namespace OpenEarthVR.Core
{
    /// <summary>
    /// VR input for photosphere mode: smooth turn, nav orb selection,
    /// and back-to-globe controls.
    /// </summary>
    public class PanoVRInput : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Transform xrOrigin;
        [SerializeField] private Transform rightController;
        [SerializeField] private Transform leftController;
        [SerializeField] private NavOrbs navOrbs;
        [SerializeField] private LineRenderer laserPointer;

        [Header("Input Actions")]
        [SerializeField] private InputActionReference rightJoystick;
        [SerializeField] private InputActionReference triggerAction;
        [SerializeField] private InputActionReference gripAction;
        [SerializeField] private InputActionReference primaryButtonAction; // A/X

        [Header("Smooth Turn")]
        [SerializeField] private float turnSpeed = 60f;
        private const float Deadzone = 0.15f;

        [Header("Laser")]
        [SerializeField] private float laserMaxLength = 200f;

        private void OnEnable()
        {
            EnableAction(rightJoystick);
            EnableAction(triggerAction);
            EnableAction(gripAction);
            EnableAction(primaryButtonAction);
        }

        private void Update()
        {
            if (AppStateMachine.Instance == null ||
                AppStateMachine.Instance.CurrentState != AppState.Photosphere)
                return;

            HandleSmoothTurn();
            HandleHover();
            HandleTrigger();
            HandleBackButtons();
            UpdateLaser();
        }

        private void HandleSmoothTurn()
        {
            if (rightJoystick == null || rightJoystick.action == null) return;
            var stick = rightJoystick.action.ReadValue<Vector2>();

            if (Mathf.Abs(stick.x) > Deadzone && xrOrigin != null)
            {
                xrOrigin.Rotate(Vector3.up, stick.x * turnSpeed * Time.deltaTime);
            }
        }

        private void HandleHover()
        {
            if (rightController == null || navOrbs == null) return;

            Ray ray = new Ray(rightController.position, rightController.forward);
            navOrbs.UpdateHover(ray);

            // Also check left controller
            if (leftController != null)
            {
                Ray leftRay = new Ray(leftController.position, leftController.forward);
                navOrbs.UpdateHover(leftRay);
            }
        }

        private void HandleTrigger()
        {
            if (triggerAction == null || triggerAction.action == null) return;
            if (!triggerAction.action.WasPressedThisFrame()) return;
            if (rightController == null || navOrbs == null) return;

            Ray ray = new Ray(rightController.position, rightController.forward);
            navOrbs.TrySelect(ray);
        }

        private void HandleBackButtons()
        {
            // Grip/squeeze → back to globe
            if (gripAction?.action != null && gripAction.action.WasPressedThisFrame())
            {
                AppStateMachine.Instance.ReturnToGlobe();
                return;
            }

            // A/X button → back to globe
            if (primaryButtonAction?.action != null && primaryButtonAction.action.WasPressedThisFrame())
            {
                AppStateMachine.Instance.ReturnToGlobe();
                return;
            }
        }

        private void UpdateLaser()
        {
            if (laserPointer == null || rightController == null) return;

            Ray ray = new Ray(rightController.position, rightController.forward);
            float length = laserMaxLength;

            if (Physics.Raycast(ray, out RaycastHit hit, laserMaxLength))
                length = hit.distance;

            laserPointer.SetPosition(0, rightController.position);
            laserPointer.SetPosition(1, rightController.position + rightController.forward * length);
        }

        private static void EnableAction(InputActionReference actionRef)
        {
            if (actionRef != null && actionRef.action != null)
                actionRef.action.Enable();
        }
    }
}

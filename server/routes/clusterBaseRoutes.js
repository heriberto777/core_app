const express = require("express");
const router = express.Router();
const ClusterBaseController = require("../controllers/clusterBaseController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

router.use(verifyToken);

/**
 * @route GET /api/v1/cluster-base
 */
router.get("/", checkPermission("cluster-base", "read"), ClusterBaseController.getClusterBase);

/**
 * @route POST /api/v1/cluster-base
 */
router.post("/", checkPermission("cluster-base", "create"), ClusterBaseController.createClusterBase);

/**
 * @route PUT /api/v1/cluster-base/:organization
 */
router.put("/:organization", checkPermission("cluster-base", "update"), ClusterBaseController.updateClusterBase);

/**
 * @route DELETE /api/v1/cluster-base/:organization
 */
// Mismo criterio que Trucks (activar/desactivar cae bajo "update", no un
// permiso "delete" aparte) — eliminar una organización es la contraparte.
router.delete("/:organization", checkPermission("cluster-base", "update"), ClusterBaseController.deleteClusterBase);

module.exports = router;

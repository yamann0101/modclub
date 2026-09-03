import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notifyRouter from "./notify";
import setupRouter from "./setup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notifyRouter);
router.use(setupRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notifyRouter from "./notify";
import setupRouter from "./setup";
import clubRouter from "./club";
import casinoRouter from "./casino";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notifyRouter);
router.use(setupRouter);
router.use(clubRouter);
router.use(casinoRouter);

export default router;

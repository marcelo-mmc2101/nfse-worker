import type { Request, Response } from "express";

export async function handleCancel(req: Request, res: Response) {
  // TODO: implement cancellation via ADN POST /DFe
  res.status(501).json({ success: false, error: "Cancelamento via API ainda nao implementado" });
}

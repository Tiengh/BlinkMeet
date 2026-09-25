import { createIceConfiguration } from "./call.service.js";

export function getIceConfiguration(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    res.status(200).json(createIceConfiguration(req.user._id));
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from "express";
import { handleError } from "./handleError.js";

type AsyncRouteHandler<P = any, ResBody = any, ReqBody = any, ReqQuery = any> =
  (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response, next: NextFunction) => Promise<unknown>;

/**
 *  Every controller method had an identical try/catch wrapper
 *  around its body, only to call handleError(res, err) in the
 *  catch. That's pure boilerplate with no business value —
 *  asyncHandler does it once, centrally, for every route.
 * 
 *  Controllers become: register the handler, no try/catch.
 *  If the handler throws OR rejects, handleError gets called
 *  automatically with the same (res, err) signature you already
 *  use everywhere.
 */
export function asyncHandler<P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
  fn: AsyncRouteHandler<P, ResBody, ReqBody, ReqQuery>
) {
  return (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch((err: unknown) => handleError(res, err));
  };
}





